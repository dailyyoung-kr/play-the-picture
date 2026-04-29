// ========================================================================
// 사용자가 직접 찾은 Apple Music URL로 manual 매칭 + 실패 원인 패턴 분석
// 일회성 스크립트
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// 한글 포함 여부
function hasKorean(s) {
  return /[가-힯ᄀ-ᇿ]/.test(s);
}
// 영문 포함 여부
function hasEnglish(s) {
  return /[a-zA-Z]/.test(s);
}

// 12곡 데이터 (1번 Autumn Groove는 "없음"이라 제외)
const TARGETS = [
  { song: "Bassister (Feat. 키드밀리)",                    artist: "Kimmy gone",          appleId: "1839391107", country: "kr" },
  { song: "BLASÉOUL(G6)",                                  artist: "BLASÉ",               appleId: "1794041425", country: "kr" },
  { song: "blessing in disguise",                          artist: "HUH YUNJIN",          appleId: "1701688693", country: "kr" },
  { song: "Hit Me Up (feat. MINGI of ATEEZ)",              artist: "미란이",              appleId: "1766657407", country: "kr" },
  { song: "IE러니",                                        artist: "염따",                appleId: "1819851732", country: "kr" },
  { song: "It Wasn't Me (feat. 최유정 (Weki Meki))",       artist: "Raiden",              appleId: "1589050831", country: "kr" },
  { song: "OTL (OFF THE LEASH)",                           artist: "루피",                appleId: "1783031377", country: "kr" },
  { song: "Promise {<pending>}",                           artist: "The Mynd Gardeners",  appleId: "1660170193", country: "kr" },
  { song: "Retail Therapy",                                artist: "ARDN",                appleId: "1843690236", country: "kr" },
  { song: "Spotlight",                                     artist: "Jieun Park",          appleId: "1865068785", country: "kr" },
  { song: "Sunshine Anywhere",                             artist: "Jieun Park",          appleId: "1815473809", country: "kr" },
  { song: "Woof",                                          artist: "제이통",              appleId: "1776579452", country: "kr" },
];

// 실패 원인 분석
function analyzeFailure(input, appleResult, country) {
  const reasons = [];

  // (A) 곡명 노이즈 — 우리 입력에 (Prod./Inst./Remix 등) 부가 정보가 있고 Apple은 없음
  const inputHasNoise = /\b(prod\.?|inst\.?|remix|version|ver\.|original)\b/i.test(input.song);
  const appleHasNoise = /\b(prod\.?|inst\.?|remix|version|ver\.|original)\b/i.test(appleResult.trackName ?? "");
  if (inputHasNoise && !appleHasNoise) reasons.push("A:곡명노이즈(Prod./Inst.등)");

  // 곡명 정규화 결과 비교
  const nInS = normalize(input.song);
  const nApS = normalize(appleResult.trackName ?? "");
  const titleMatch = nInS === nApS || nInS.includes(nApS) || nApS.includes(nInS);

  // (B) 아티스트 한영 표기 차이
  const inputArtist = input.artist;
  const appleArtist = appleResult.artistName ?? "";
  const inputKr = hasKorean(inputArtist);
  const appleKr = hasKorean(appleArtist);
  const inputEn = hasEnglish(inputArtist);
  const appleEn = hasEnglish(appleArtist);
  const nInA = normalize(inputArtist);
  const nApA = normalize(appleArtist);
  if (nInA !== nApA && !nApA.includes(nInA) && !nInA.includes(nApA)) {
    if (inputKr !== appleKr || inputEn !== appleEn) {
      reasons.push("B:아티스트한영표기");
    } else {
      reasons.push("D:아티스트표기변형");
    }
  }

  // (C) country 차이
  if (country !== "kr") reasons.push(`C:country(${country.toUpperCase()})`);

  // (D) 곡명 표기 변형 (A 카테고리에 안 잡혔는데 정규화 다른 경우)
  if (!titleMatch && !inputHasNoise) reasons.push("D:곡명표기변형");

  // (G) 특수문자/이모지 — Apple은 정상이지만 우리 곡명에 이상한 문자
  if (/[{}<>]/.test(input.song)) reasons.push("G:특수문자포함");

  if (reasons.length === 0) reasons.push("Z:원인불명");
  return reasons;
}

async function lookupItunes(id, country) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] ?? null;
}

async function main() {
  console.log("Manual 매칭 + 패턴 분석 시작 (12곡)");
  console.log("---");

  const patternCount = {};
  const detailRows = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const apple = await lookupItunes(t.appleId, t.country);

    if (!apple) {
      console.log(`[${i + 2}] ${t.song} — lookup 실패`);
      detailRows.push({
        n: i + 2, song: t.song, artist: t.artist,
        appleSong: "(lookup 실패)", appleArtist: "-",
        reasons: ["X:lookup실패"],
      });
      continue;
    }

    const reasons = analyzeFailure(t, apple, t.country);
    for (const r of reasons) patternCount[r] = (patternCount[r] ?? 0) + 1;

    detailRows.push({
      n: i + 2,
      song: t.song,
      artist: t.artist,
      appleSong: apple.trackName,
      appleArtist: apple.artistName,
      duration: Math.round((apple.trackTimeMillis ?? 0) / 1000),
      reasons,
    });

    // DB UPDATE
    const trackKey = makeTrackKey(t.song, t.artist);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("itunes_preview_cache")
      .update({
        preview_url: apple.previewUrl ?? null,
        matched_track_name: apple.trackName,
        matched_artist_name: apple.artistName,
        match_score: 100,
        candidates_count: 1,
        status: "manual",
        last_attempted_at: now,
        matched_at: now,
      })
      .eq("track_key", trackKey);

    if (error) console.error(`[${i + 2}] DB UPDATE 실패: ${error.message}`);

    // 텀
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("처리 완료\n");

  // 상세 결과 표
  console.log("=== 상세 결과 ===");
  for (const row of detailRows) {
    console.log(`\n[${row.n}] ${row.song} / ${row.artist}`);
    console.log(`    Apple: ${row.appleSong} / ${row.appleArtist} (${row.duration ?? "?"}초)`);
    console.log(`    원인: ${row.reasons.join(", ")}`);
  }

  // 패턴 종합
  console.log("\n\n=== 실패 원인 패턴 통계 ===");
  const sorted = Object.entries(patternCount).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sorted) {
    console.log(`  ${pattern}: ${count}건`);
  }

  // DB 최종 상태
  const { data: finalStats } = await supabase
    .from("itunes_preview_cache")
    .select("status");
  const counts = {};
  for (const r of finalStats ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("\n=== DB 캐시 status 분포 ===");
  for (const [status, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${n}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const matchedAll = (counts.matched ?? 0) + (counts.matched_by_duration ?? 0) + (counts.matched_by_llm ?? 0) + (counts.manual ?? 0);
  console.log(`  ───────────────────────`);
  console.log(`  전체 매칭률: ${matchedAll} / ${total} = ${(matchedAll * 100 / total).toFixed(1)}%`);
}

main().catch((err) => { console.error("[FATAL]", err); process.exit(1); });
