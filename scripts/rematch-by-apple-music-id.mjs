// ========================================================================
// Apple Music trackId → iTunes Lookup API → preview_url → DB update
//
// 사용자가 Apple Music 링크로 직접 정확한 곡 지정. trackId 파싱 후 iTunes
// Lookup API로 preview_url 받아 itunes_preview_cache update (status='manual').
//
// 실행: node scripts/rematch-by-apple-music-id.mjs
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  const c = readFileSync(".env.local", "utf-8");
  for (const line of c.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// (song, artist, trackId) — 사용자 제공 10곡 (3차 batch — EXCLUDED 재검토 후 매칭 인정)
const TARGETS = [
  { song: "Boyfriend (Feat. Khakii)", artist: "CHAI", trackId: "1500863580" },
  { song: "미쳐버리겠다 (MAD)", artist: "BE'O", trackId: "1785800393" },
  { song: "iloveitiloveitiloveit", artist: "Bella Kay", trackId: "1867034427" },
  { song: "dear me,", artist: "Gentle Bones", trackId: "1530803374" },
  { song: "Take on Me", artist: "Kaiak", trackId: "1612835382" },
  { song: "2 soon", artist: "keshi", trackId: "1586318446" },
  { song: "青と夏", artist: "Mrs. GREEN APPLE", trackId: "1408505264" },
  { song: "Killing Me", artist: "Omar Apollo", trackId: "1615498876" },
  { song: "Photograph", artist: "다섯", trackId: "1597259748" },
  { song: "우리의 밤을 외워요", artist: "카더가든", trackId: "1469018486" },
];

// itunes-preview/route.ts와 동일한 normalize / makeTrackKey
function normalize(s) {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}
function makeTrackKey(title, artist) {
  return `${normalize(title)}|${normalize(artist)}`;
}

async function lookupTrack(trackId) {
  const url = `https://itunes.apple.com/lookup?id=${trackId}&country=kr`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const r = data.results[0];
  if (!r.previewUrl) return null;
  return {
    previewUrl: r.previewUrl,
    matchedTrackName: r.trackName,
    matchedArtistName: r.artistName,
  };
}

async function main() {
  let success = 0, noPreview = 0, fail = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const { song, artist, trackId } = TARGETS[i];
    const trackKey = makeTrackKey(song, artist);
    process.stdout.write(`[${i + 1}/${TARGETS.length}] ${song} / ${artist} (id=${trackId}) ... `);
    try {
      const result = await lookupTrack(trackId);
      if (!result) {
        console.log("preview 없음 / 결과 없음");
        noPreview++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("itunes_preview_cache")
        .update({
          preview_url: result.previewUrl,
          matched_track_name: result.matchedTrackName,
          matched_artist_name: result.matchedArtistName,
          match_score: 100, // 사용자가 직접 검증
          status: "manual",
          last_attempted_at: now,
          matched_at: now,
        })
        .eq("track_key", trackKey);
      if (upErr) {
        console.log("DB update 실패:", upErr.message);
        fail++;
      } else {
        console.log(`✅ matched`);
        success++;
      }
    } catch (e) {
      console.log("error:", e.message);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n========================================");
  console.log(`완료: 성공 ${success}곡 / preview 없음 ${noPreview}곡 / 실패 ${fail}곡`);
}

main().catch((e) => {
  console.error("[rematch] 치명 오류:", e);
  process.exit(1);
});
