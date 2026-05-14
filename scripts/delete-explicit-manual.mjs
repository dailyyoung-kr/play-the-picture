// ========================================================================
// status='manual' 곡들 중 explicit인 곡 일괄 삭제
//
// 흐름:
// 1. manual 매칭된 곡 (~82개) 조회
// 2. 각 곡의 spotify_track_id로 Spotify API → explicit 확인
// 3. 영향 범위 점검 (entries, recommendation_logs)
// 4. 삭제 실행 (recommendation_logs → cache → songs)
//
// 정책: 청소년 보호 + iTunes Search 글로벌 차단 우회 불가능 → explicit 곡 거부
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  const c = readFileSync(".env.local", "utf-8");
  for (const line of c.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}
loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const sec = process.env.SPOTIFY_CLIENT_SECRET;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${sec}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error("Spotify token 실패");
  return (await r.json()).access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const token = await getSpotifyToken();
  console.log("Spotify token OK");

  // 1. manual 매칭된 곡들 + spotify_track_id JOIN
  const PAGE = 1000;
  const manualCache = [];
  for (let off = 0; ; off += PAGE) {
    const { data } = await sb
      .from("itunes_preview_cache")
      .select("song, artist")
      .eq("status", "manual")
      .range(off, off + PAGE - 1);
    if (!data?.length) break;
    manualCache.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`manual 매칭 곡: ${manualCache.length}`);

  const songsRows = [];
  for (let off = 0; ; off += PAGE) {
    const { data } = await sb
      .from("songs")
      .select("id, song, artist, spotify_track_id")
      .not("spotify_track_id", "is", null)
      .range(off, off + PAGE - 1);
    if (!data?.length) break;
    songsRows.push(...data);
    if (data.length < PAGE) break;
  }

  const cacheKeys = new Set(manualCache.map((c) => `${c.song}|${c.artist}`));
  const targets = songsRows.filter((s) => cacheKeys.has(`${s.song}|${s.artist}`));
  console.log(`spotify_track_id 있는 manual 곡: ${targets.length}`);

  // 2. Spotify에서 explicit 정보
  const explicitSongs = [];
  const nonExplicitSongs = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const r = await fetch(`https://api.spotify.com/v1/tracks/${t.spotify_track_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get("Retry-After") ?? "60");
        console.log(`429. ${retryAfter}초 대기...`);
        await sleep(retryAfter * 1000);
        i--;  // 재시도
        continue;
      }
      console.error(`[X] Spotify ${r.status}: ${t.song}`);
      continue;
    }
    const data = await r.json();
    if (data.explicit) explicitSongs.push(t);
    else nonExplicitSongs.push(t);

    if ((i + 1) % 20 === 0) console.log(`[${i + 1}/${targets.length}] explicit:${explicitSongs.length}`);
    await sleep(800);
    if ((i + 1) % 30 === 0) {
      console.log(`30곡 처리 → 30초 대기`);
      await sleep(30000);
    }
  }

  console.log(`\n=== 분류 결과 ===`);
  console.log(`explicit: ${explicitSongs.length}곡`);
  console.log(`non-explicit: ${nonExplicitSongs.length}곡`);

  if (explicitSongs.length === 0) {
    console.log("\n삭제할 곡 없음. 종료.");
    return;
  }

  // 3. 영향 범위 점검
  const explicitIds = explicitSongs.map((s) => s.id);
  const { count: recLogsCount } = await sb
    .from("recommendation_logs")
    .select("*", { count: "exact", head: true })
    .in("song_id", explicitIds);

  // entries에 추천 이력 (song/artist 기반)
  const { count: entriesCount } = await sb
    .from("entries")
    .select("*", { count: "exact", head: true })
    .or(explicitSongs.map((s) => `and(song.eq.${s.song.replace(/'/g, "''")},artist.eq.${s.artist.replace(/'/g, "''")})`).slice(0, 5).join(","))
    .limit(5);

  console.log(`\n=== 영향 범위 ===`);
  console.log(`recommendation_logs: ${recLogsCount}건 (FK 정리 대상)`);
  console.log(`entries (추천 이력): ${entriesCount ?? "?"}건 (히스토리 보존)`);

  console.log(`\n=== 삭제 대상 곡 (앞 10개) ===`);
  for (const s of explicitSongs.slice(0, 10)) {
    console.log(`  ${s.song} / ${s.artist}`);
  }
  if (explicitSongs.length > 10) console.log(`  ... 외 ${explicitSongs.length - 10}곡`);

  // 4. 삭제 실행
  console.log(`\n=== 삭제 시작 ===`);

  // 4-a. recommendation_logs 먼저 (FK)
  const { data: delRec, error: errRec } = await sb
    .from("recommendation_logs")
    .delete()
    .in("song_id", explicitIds)
    .select();
  if (errRec) { console.error("rec_logs 삭제 실패:", errRec.message); process.exit(1); }
  console.log(`recommendation_logs 삭제: ${delRec?.length ?? 0}건`);

  // 4-b. itunes_preview_cache (song, artist 기반)
  let cacheDeleted = 0;
  for (const s of explicitSongs) {
    const { data, error } = await sb
      .from("itunes_preview_cache")
      .delete()
      .eq("song", s.song)
      .eq("artist", s.artist)
      .select();
    if (error) console.error(`cache 삭제 실패 [${s.song}]:`, error.message);
    else cacheDeleted += data?.length ?? 0;
  }
  console.log(`itunes_preview_cache 삭제: ${cacheDeleted}건`);

  // 4-c. songs 삭제
  let songsDeleted = 0;
  for (const s of explicitSongs) {
    const { data, error } = await sb
      .from("songs")
      .delete()
      .eq("id", s.id)
      .select();
    if (error) console.error(`songs 삭제 실패 [${s.song}]:`, error.message);
    else songsDeleted += data?.length ?? 0;
  }
  console.log(`songs 삭제: ${songsDeleted}건`);

  // 5. 최종 통계
  const { count: songsTotal } = await sb.from("songs").select("*", { count: "exact", head: true });
  const { count: cacheTotal } = await sb.from("itunes_preview_cache").select("*", { count: "exact", head: true });
  const { data: byStatus } = await sb.from("itunes_preview_cache").select("status");
  const counts = {};
  for (const r of byStatus ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;

  console.log(`\n=== 최종 ===`);
  console.log(`songs: ${songsTotal}`);
  console.log(`itunes_preview_cache: ${cacheTotal}`);
  for (const [s, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${n}`);
  }
}

main().catch((err) => { console.error("[FATAL]", err); process.exit(1); });
