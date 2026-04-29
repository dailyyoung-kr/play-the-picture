// ========================================================================
// Spotify duration 기반 iTunes 미리듣기 매칭 스크립트 (Phase 1)
//
// ⚠️ 변경 (4/29): iTunes Search API가 ISRC 검색을 지원 안 해서, ISRC 대신
//    Spotify의 duration_ms로 매칭. 트랙명 정규화 일치 + duration ±2초 일치
//    = 사실상 같은 곡 확정. 한영 아티스트명 표기 차이 우회.
//
// 흐름:
// 1. 실패 곡(low_score / no_results) + spotify_track_id 있는 것 조회
// 2. 각 곡:
//    a. Spotify GET /v1/tracks/{id} → duration_ms 받기
//    b. iTunes Search 기존 방식 (artist + title)
//    c. 후보 중 (트랙명 매칭) AND (duration_ms ±2000ms 일치) → 채택
//    d. itunes_preview_cache UPDATE (status='matched_by_duration')
// 3. 보수적 텀: 2초 + 25곡당 60초 (Spotify 30초 rolling window 보호)
//
// 사용법: node scripts/match-by-isrc.mjs
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── 환경변수 로드 (.env.local) ──
function loadEnv() {
  const content = readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) process.env[key] = value;
  }
}
loadEnv();

// ── 설정 (보수적 — Spotify rate limit 보호) ──
const DELAY_MS = 2000;          // 곡 간 2초 (import-text의 1초 → 2배)
const BATCH_SIZE = 25;          // 25곡마다
const BATCH_REST_MS = 60000;    // 60초 추가 대기 (Spotify 30초 window의 2배)
const LOG_EVERY = 10;

// ── Spotify token 발급 (import-text의 getClientCredentialsToken 패턴) ──
async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[!] SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET 누락");
    process.exit(1);
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    console.error("[!] Spotify token 발급 실패:", res.status);
    process.exit(1);
  }
  const data = await res.json();
  return data.access_token;
}

// ── 정규화 (track_key 생성용 — route.ts와 동일) ──
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}
function makeTrackKey(title, artist) {
  return `${normalize(title)}|${normalize(artist)}`;
}

// ── 유틸 ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}분 ${s}초`;
};

// ── 메인 ──
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("ISRC 기반 iTunes 매칭 시작 (Phase 1)");
  console.log(`  텀: ${DELAY_MS / 1000}초 / batch: ${BATCH_SIZE}곡 / rest: ${BATCH_REST_MS / 1000}초`);
  console.log("---");

  // 1. Spotify token 발급
  const spotifyToken = await getSpotifyToken();
  console.log("Spotify token 발급 OK");

  // 2. 대상 조회 — 두 단계 후 메모리 JOIN (FK 없어서 PostgREST inner join 불가)
  // 2-a. 실패 곡 조회 (status != 'matched')
  const PAGE_SIZE = 1000;
  const failedSongs = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("itunes_preview_cache")
      .select("song, artist, status")
      .neq("status", "matched")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[!] itunes_preview_cache 조회 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    failedSongs.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`실패 곡: ${failedSongs.length}건`);

  // 2-b. songs 조회 (spotify_track_id 있는 것만)
  const songsRows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("songs")
      .select("id, song, artist, spotify_track_id")
      .not("spotify_track_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[!] songs 조회 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    songsRows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`spotify_track_id 있는 songs: ${songsRows.length}건`);

  // 2-c. 메모리 JOIN (song + artist 키)
  const failedKeys = new Set(failedSongs.map((f) => `${f.song}|${f.artist}`));
  const targets = songsRows.filter((s) => failedKeys.has(`${s.song}|${s.artist}`));

  if (targets.length === 0) {
    console.log("처리할 곡이 없습니다.");
    return;
  }

  const estMin = Math.ceil(
    (targets.length * DELAY_MS + Math.floor(targets.length / BATCH_SIZE) * BATCH_REST_MS) / 60000
  );
  console.log(`대상 곡: ${targets.length}개 / 예상 시간: 약 ${estMin}분`);
  console.log("---");

  // 3. 순회
  let processed = 0;
  let savedByDuration = 0;
  let stillFailed = 0;
  let metaMissing = 0;
  let errors = 0;
  const startedAt = Date.now();

  for (const song of targets) {
    try {
      // (a) Spotify track 정보 조회 → duration_ms 받기
      const spotifyRes = await fetch(
        `https://api.spotify.com/v1/tracks/${song.spotify_track_id}`,
        { headers: { Authorization: `Bearer ${spotifyToken}` } }
      );

      if (!spotifyRes.ok) {
        if (spotifyRes.status === 429) {
          const retryAfter = parseInt(spotifyRes.headers.get("Retry-After") ?? "60");
          console.log(`[!] Spotify 429. ${retryAfter}초 대기...`);
          await sleep(retryAfter * 1000);
          // 다음 반복으로 (이 곡은 skip, processed++만)
          processed++;
          await sleep(DELAY_MS);
          continue;
        }
        console.error(`[X] Spotify 실패 ${spotifyRes.status}: ${song.song} - ${song.artist}`);
        errors++;
        processed++;
        await sleep(DELAY_MS);
        continue;
      }

      const spotifyData = await spotifyRes.json();
      const durationMs = spotifyData.duration_ms;

      if (!durationMs) {
        metaMissing++;
        processed++;
        await sleep(DELAY_MS);
        continue;
      }

      // (b) iTunes Search 기존 방식 (artist + title)
      const term = `${song.artist} ${song.song}`;
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=kr`
      );

      if (!itunesRes.ok) {
        errors++;
        processed++;
        await sleep(DELAY_MS);
        continue;
      }

      const itunesData = await itunesRes.json();
      const candidates = itunesData.results ?? [];

      // (c) duration ±2초 일치 + 트랙명 매칭(정규화 동일 or 포함) 인 것 채택
      const targetTitleNorm = normalize(song.song);
      const matched = candidates.find((c) => {
        if (!c.previewUrl) return false;
        // duration 매칭
        const durationOk = c.trackTimeMillis &&
          Math.abs(c.trackTimeMillis - durationMs) <= 2000;
        if (!durationOk) return false;
        // 트랙명 안전망 (정규화 후 동일 or 포함)
        const candTitleNorm = normalize(c.trackName ?? "");
        const titleOk = candTitleNorm === targetTitleNorm ||
          candTitleNorm.includes(targetTitleNorm) ||
          targetTitleNorm.includes(candTitleNorm);
        return titleOk;
      });

      if (matched) {
        // (d) cache UPDATE — track_key로 기존 row 갱신
        const trackKey = makeTrackKey(song.song, song.artist);
        const now = new Date().toISOString();

        const { error: upErr } = await supabase
          .from("itunes_preview_cache")
          .update({
            preview_url: matched.previewUrl,
            matched_track_name: matched.trackName,
            matched_artist_name: matched.artistName,
            match_score: 100, // duration + title 둘 다 일치 = 정확 매칭
            candidates_count: candidates.length,
            status: "matched_by_duration",
            last_attempted_at: now,
            matched_at: now,
          })
          .eq("track_key", trackKey);

        if (upErr) {
          console.error(`[X] DB UPDATE 실패: ${song.song}: ${upErr.message}`);
          errors++;
        } else {
          savedByDuration++;
        }
      } else {
        stillFailed++;
      }
    } catch (err) {
      errors++;
      console.error(`[X] ${song.song} - ${song.artist}: ${err.message}`);
    }

    processed++;

    if (processed % LOG_EVERY === 0 || processed === targets.length) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const remainingSec = (targets.length - processed) * (DELAY_MS / 1000);
      console.log(
        `[${processed}/${targets.length}] saved:${savedByDuration} still_fail:${stillFailed} no_meta:${metaMissing} err:${errors} ` +
          `| elapsed: ${fmtTime(elapsedSec)} / ETA: ${fmtTime(remainingSec)}`
      );
    }

    if (processed < targets.length) {
      await sleep(DELAY_MS);
      // batch break
      if (processed % BATCH_SIZE === 0) {
        console.log(`  ... ${BATCH_REST_MS / 1000}초 휴식 (batch ${processed / BATCH_SIZE} 완료)`);
        await sleep(BATCH_REST_MS);
      }
    }
  }

  // 4. 최종 통계
  console.log("---");
  console.log("✅ Duration 매칭 완료");
  console.log(`  대상: ${targets.length}곡`);
  console.log(`  duration으로 매칭됨: ${savedByDuration}곡 (status='matched_by_duration')`);
  console.log(`  여전히 실패:        ${stillFailed}곡 (길이/제목 모두 일치 후보 없음)`);
  console.log(`  Spotify 메타 없음:   ${metaMissing}곡`);
  console.log(`  errors:             ${errors}곡`);
  console.log(`  실행 시간: ${fmtTime((Date.now() - startedAt) / 1000)}`);

  // 5. DB 최종 통계
  const { data: finalStats } = await supabase
    .from("itunes_preview_cache")
    .select("status");
  const counts = {};
  for (const r of finalStats ?? []) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  console.log("---");
  console.log("DB 캐시 status 분포:");
  for (const [status, n] of Object.entries(counts)) {
    console.log(`  ${status}: ${n}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const matchedAll =
    (counts.matched ?? 0) + (counts.matched_by_duration ?? 0);
  console.log(`  ───────────────────────`);
  console.log(`  전체 매칭률: ${matchedAll} / ${total} = ${(matchedAll * 100 / total).toFixed(1)}%`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
