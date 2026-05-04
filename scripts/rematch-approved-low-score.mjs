// ========================================================================
// low_score score=50 곡 중 사용자 검증 완료 (97곡) iTunes 재매칭
//
// 배경: iTunes 매칭 알고리즘이 K-POP 한글/영어 표기 차이로 score 50으로 떨어져
//       low_score로 분류 + preview_url NULL 저장. preview 재생 불가.
//       사용자가 114곡 중 97곡을 안전 매칭 인정 (track 일치 + 같은 곡 확인).
//
// 흐름:
// 1. itunes_preview_cache에서 status='low_score' AND match_score=50 곡 fetch
// 2. EXCLUDED track_key 17개 (사용자가 다른 곡으로 판단) 제외 → 97곡
// 3. 각 곡에 대해 iTunes API 재호출
// 4. best 결과의 preview_url 받아 update + status='manual'로 저장
// 5. 진행 상황 출력
//
// 실행: node scripts/rematch-approved-low-score.mjs
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

// 사용자가 직접 검증해 "다른 곡"으로 판단한 17개 track_key (제외 대상)
const EXCLUDED_TRACK_KEYS = new Set([
  "2soon|keshi",
  "911mrlonely|tylerthecreator",
  "busywoman|sabrinacarpenter",
  "city|오왼",
  "dearme|gentlebones",
  "iwannabeyourslave|måneskin",
  "iloveitiloveitiloveit|bellakay",
  "ivy|frankocean",
  "killingme|omarapollo",
  "photograph|다섯",
  "pinkmatter|frankocean",
  "rockstarmade|playboicarti",
  "takeonme|kaiak",
  "withtheie|제니",
  "미쳐버리겠다|beo",
  "우리의밤을외워요|카더가든",
  "青と夏|mrsgreenapple",
]);

function normalize(s) {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

function scoreMatch(targetTitle, targetArtist, candTitle, candArtist) {
  const nT = normalize(targetTitle);
  const nA = normalize(targetArtist);
  const cT = normalize(candTitle);
  const cA = normalize(candArtist);
  const isInst = /instrumental|inst\./i.test(candTitle) || /remix|version/i.test(candTitle);
  let score = 0;
  if (cT === nT) score += 50;
  else if (cT.includes(nT) || nT.includes(cT)) score += 30;
  if (cA === nA) score += 50;
  else if (cA.includes(nA) || nA.includes(cA)) score += 30;
  if (isInst) score -= 15;
  return score;
}

async function fetchFromItunes(title, artist) {
  const term = `${artist} ${title}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=kr`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const scored = data.results
    .map((r) => ({ r, score: scoreMatch(title, artist, r.trackName, r.artistName) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || !best.r.previewUrl) return null;
  return {
    previewUrl: best.r.previewUrl,
    matchedTrackName: best.r.trackName,
    matchedArtistName: best.r.artistName,
    matchScore: best.score,
    candidatesCount: data.results.length,
  };
}

async function main() {
  console.log("[rematch] low_score score=50 곡 fetch...");
  const { data: rows, error } = await supabase
    .from("itunes_preview_cache")
    .select("track_key, song, artist")
    .eq("status", "low_score")
    .eq("match_score", 50);

  if (error) {
    console.error("[rematch] DB 조회 실패:", error.message);
    process.exit(1);
  }

  const targets = rows.filter((r) => !EXCLUDED_TRACK_KEYS.has(r.track_key));
  console.log(`[rematch] 전체 ${rows.length}곡, 제외 ${rows.length - targets.length}곡, 처리 대상 ${targets.length}곡`);

  let success = 0, noPreview = 0, fail = 0;

  for (let i = 0; i < targets.length; i++) {
    const { track_key, song, artist } = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${song} / ${artist} ... `);
    try {
      const result = await fetchFromItunes(song, artist);
      if (!result) {
        console.log("preview 없음 / iTunes 결과 없음");
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
          match_score: result.matchScore,
          candidates_count: result.candidatesCount,
          status: "manual",
          last_attempted_at: now,
          matched_at: now,
        })
        .eq("track_key", track_key);
      if (upErr) {
        console.log("DB update 실패:", upErr.message);
        fail++;
      } else {
        console.log(`✅ matched (score ${result.matchScore})`);
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
