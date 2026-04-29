// ========================================================================
// songs DB 전곡 iTunes 미리듣기 일괄 매칭 스크립트
//
// 사용법:
//   node scripts/match-all-songs.mjs
//
// 동작:
// 1. .env.local 로드
// 2. itunes_preview_cache에 이미 status='matched'인 track_key 미리 조회 → skip
// 3. songs 테이블 전곡 순회
// 4. /api/itunes-preview production 엔드포인트 호출 (5초 텀)
// 5. 429 응답 시 Retry-After 존중
// 6. 진행 로그 + 최종 통계
//
// 중단 시: Ctrl+C. 이미 처리된 곡은 다시 실행 시 skip됨 (DB 캐시 활용).
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

// ── 설정 ──
const BASE_URL = "https://playthepicture.com";
const DELAY_MS = 3000;     // 곡 간 텀 (3초)
const LOG_EVERY = 10;      // N곡마다 진행 로그
const RETRY_429_BACKOFF = 60_000; // Retry-After 헤더 없을 때 기본 대기

// ── 정규화 (route.ts와 동일하게) ──
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

  console.log("songs DB 전곡 iTunes 매칭 시작");
  console.log(`  텀: ${DELAY_MS / 1000}초`);
  console.log(`  endpoint: ${BASE_URL}/api/itunes-preview`);
  console.log("---");

  // 1. 이미 matched된 track_key 미리 조회 (skip 대상)
  const { data: matchedRows, error: matchedErr } = await supabase
    .from("itunes_preview_cache")
    .select("track_key")
    .eq("status", "matched");

  if (matchedErr) {
    console.error("[!] itunes_preview_cache 조회 실패:", matchedErr.message);
    process.exit(1);
  }
  const matchedKeys = new Set((matchedRows ?? []).map((r) => r.track_key));
  console.log(`이미 매칭된 곡: ${matchedKeys.size}건 (skip 예정)`);

  // 2. songs 테이블 전곡 조회 (Supabase 기본 limit 1000 우회 — 페이지네이션)
  const PAGE_SIZE = 1000;
  const songs = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("songs")
      .select("song, artist")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[!] songs 조회 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    songs.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // 3. skip 분류
  const toProcess = [];
  let alreadyMatched = 0;
  for (const s of songs) {
    const key = makeTrackKey(s.song, s.artist);
    if (matchedKeys.has(key)) alreadyMatched++;
    else toProcess.push(s);
  }

  const estMin = Math.ceil((toProcess.length * DELAY_MS) / 60000);
  console.log(`총 ${songs.length}곡 / 처리 대상: ${toProcess.length}곡`);
  console.log(`예상 시간: 약 ${estMin}분`);
  console.log("---");

  // 4. 순회
  let processed = 0;
  let cacheHits = 0;
  let newMatches = 0;
  let newFailures = 0;
  let errors = 0;
  const startedAt = Date.now();

  for (const song of toProcess) {
    const url = `${BASE_URL}/api/itunes-preview?title=${encodeURIComponent(
      song.song
    )}&artist=${encodeURIComponent(song.artist)}`;

    let res;
    try {
      res = await fetch(url);

      // 429 처리
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0");
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : RETRY_429_BACKOFF;
        console.log(`[!] 429 rate limit. ${waitMs / 1000}초 대기 후 재시도...`);
        await sleep(waitMs);
        res = await fetch(url);
      }

      const data = await res.json();
      if (data.cache_hit) cacheHits++;
      else if (data.previewUrl) newMatches++;
      else newFailures++;
    } catch (err) {
      errors++;
      console.error(`[X] ${song.song} - ${song.artist}: ${err.message}`);
    }

    processed++;

    if (processed % LOG_EVERY === 0 || processed === toProcess.length) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const remainingSec = (toProcess.length - processed) * (DELAY_MS / 1000);
      console.log(
        `[${processed}/${toProcess.length}] ` +
          `hit:${cacheHits} matched:${newMatches} fail:${newFailures} err:${errors} ` +
          `| elapsed: ${fmtTime(elapsedSec)} / ETA: ${fmtTime(remainingSec)}`
      );
    }

    // 마지막 곡엔 sleep 불필요
    if (processed < toProcess.length) {
      await sleep(DELAY_MS);
    }
  }

  // 5. 최종 통계
  console.log("---");
  console.log("✅ 완료");
  console.log(`  대상: ${toProcess.length}곡 / 이미 matched: ${alreadyMatched}곡`);
  console.log(`  cache hit (재호출):  ${cacheHits}곡`);
  console.log(`  new matched (신규):  ${newMatches}곡`);
  console.log(`  failed (low_score / no_results): ${newFailures}곡`);
  console.log(`  errors (네트워크 등):  ${errors}곡`);
  console.log(`  실행 시간: ${fmtTime((Date.now() - startedAt) / 1000)}`);

  // 6. DB 최종 통계
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
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
