// ========================================================================
// LLM 기반 iTunes 미리듣기 매칭 스크립트 (Phase 3)
//
// 동작:
// 1. low_score 곡 + spotify_track_id 있는 것 조회
// 2. 각 곡:
//    a. Spotify에서 duration_ms 받기 (참고용)
//    b. iTunes Search → 후보 10개
//    c. Claude Haiku에 질문 (사용자 입력 + 후보 정보)
//    d. LLM이 정답 번호 (1~10 또는 0) 응답
//    e. 안전장치: LLM이 고른 후보의 duration ±2초 일치 확인
//    f. cache UPDATE (status='matched_by_llm')
//
// 텀: 1.5초 (Anthropic은 분당 5000 RPM 가능, Spotify 30초 window 보호)
// 비용: Haiku 곡당 ~$0.0005, ~$0.04~0.10 (전체)
//
// 사용법: node scripts/match-by-llm.mjs
// ========================================================================

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

// ── 환경변수 로드 ──
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
const DELAY_MS = 1500;          // 곡 간 1.5초
const BATCH_SIZE = 25;          // 25곡마다
const BATCH_REST_MS = 60000;    // 60초 추가 대기
const LOG_EVERY = 10;
const DURATION_TOLERANCE_MS = 2000; // duration 안전장치 ±2초

// ── Spotify token ──
async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
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
  return (await res.json()).access_token;
}

// ── 정규화 ──
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

// ── LLM 호출 ──
async function askLLMForMatch(anthropic, song, artist, durationMs, candidates) {
  const candidatesText = candidates.map((c, i) => {
    const dur = c.trackTimeMillis ? Math.round(c.trackTimeMillis / 1000) : "?";
    return `  ${i + 1}. ${c.trackName} / ${c.artistName} / ${dur}초`;
  }).join("\n");

  const prompt = `사용자가 찾는 곡:
  곡명: ${song}
  아티스트: ${artist}
  길이: ${Math.round(durationMs / 1000)}초

iTunes 후보:
${candidatesText}

이 중 사용자가 찾는 원곡과 같은 것은 몇 번?

규칙:
- 원곡(Original)만 선택. 인스트루멘탈/Inst., 리믹스/Remix, 외국어 버전, 라이브 버전, 데모 제외.
- 곡명과 아티스트가 같고 정상 발매된 원곡을 우선.
- 한국 아티스트 표기는 영문/한글 다 허용 (예: BOYNEXTDOOR ↔ 보이넥스트도어).
- 곡 길이가 사용자 입력과 비슷하면 같은 곡일 가능성 높음.
- 같은 원곡이 없으면 0.

답: 1~10 사이 숫자 또는 0. 다른 설명 없이 숫자만.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 10,
    system: "당신은 음악 메타데이터 매칭 전문가입니다. 사용자 입력과 가장 일치하는 원곡을 후보 중에서 골라주세요. 답은 숫자만.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const match = text.match(/\d+/);
  if (!match) return null;
  const num = parseInt(match[0]);
  if (isNaN(num) || num < 0 || num > 10) return null;
  return num;
}

// ── 메인 ──
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log("LLM 기반 iTunes 매칭 시작 (Phase 3)");
  console.log(`  텀: ${DELAY_MS / 1000}초 / batch: ${BATCH_SIZE} / rest: ${BATCH_REST_MS / 1000}초`);
  console.log(`  모델: claude-haiku-4-5`);
  console.log("---");

  const spotifyToken = await getSpotifyToken();
  console.log("Spotify token 발급 OK");

  // 1. 실패 곡 + spotify_track_id 있는 것 조회
  const PAGE_SIZE = 1000;
  const failedSongs = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("itunes_preview_cache")
      .select("song, artist, candidates_count")
      .eq("status", "low_score")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("[!]", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    failedSongs.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`low_score 곡: ${failedSongs.length}건`);

  const songsRows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("songs")
      .select("song, artist, spotify_track_id")
      .not("spotify_track_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("[!]", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    songsRows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // 메모리 JOIN
  const failedMap = new Map();
  for (const f of failedSongs) failedMap.set(`${f.song}|${f.artist}`, f);
  const targets = [];
  for (const s of songsRows) {
    const f = failedMap.get(`${s.song}|${s.artist}`);
    if (f) targets.push({ ...s, candidates_count: f.candidates_count });
  }

  // candidates_count 기준 정렬 (10 가득인 곡 우선)
  targets.sort((a, b) => (b.candidates_count ?? 0) - (a.candidates_count ?? 0));

  const estMin = Math.ceil(
    (targets.length * (DELAY_MS + 1500) + Math.floor(targets.length / BATCH_SIZE) * BATCH_REST_MS) / 60000
  );
  console.log(`대상 곡: ${targets.length}개 / 예상 시간: 약 ${estMin}분`);
  console.log("---");

  // 2. 순회
  let processed = 0, savedByLLM = 0, llmRejected = 0;
  let durationMismatch = 0, errors = 0;
  const startedAt = Date.now();

  for (const song of targets) {
    try {
      // (a) Spotify duration
      const spotifyRes = await fetch(
        `https://api.spotify.com/v1/tracks/${song.spotify_track_id}`,
        { headers: { Authorization: `Bearer ${spotifyToken}` } }
      );
      if (!spotifyRes.ok) {
        if (spotifyRes.status === 429) {
          const retryAfter = parseInt(spotifyRes.headers.get("Retry-After") ?? "60");
          console.log(`[!] Spotify 429. ${retryAfter}초 대기...`);
          await sleep(retryAfter * 1000);
        }
        errors++; processed++;
        await sleep(DELAY_MS);
        continue;
      }
      const spotifyData = await spotifyRes.json();
      const durationMs = spotifyData.duration_ms;
      if (!durationMs) { errors++; processed++; await sleep(DELAY_MS); continue; }

      // (b) iTunes Search
      const term = `${song.artist} ${song.song}`;
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=kr`
      );
      if (!itunesRes.ok) { errors++; processed++; await sleep(DELAY_MS); continue; }
      const itunesData = await itunesRes.json();
      const candidates = (itunesData.results ?? []).filter((c) => c.previewUrl);
      if (candidates.length === 0) { llmRejected++; processed++; await sleep(DELAY_MS); continue; }

      // (c) LLM 호출
      const llmAnswer = await askLLMForMatch(anthropic, song.song, song.artist, durationMs, candidates);

      if (llmAnswer === null || llmAnswer === 0) {
        llmRejected++;
      } else {
        const idx = llmAnswer - 1;
        const chosen = candidates[idx];
        if (!chosen) {
          llmRejected++;
        } else {
          // (d) 안전장치: duration ±2초 검증
          const durationOk = chosen.trackTimeMillis &&
            Math.abs(chosen.trackTimeMillis - durationMs) <= DURATION_TOLERANCE_MS;

          if (!durationOk) {
            durationMismatch++;
          } else {
            // (e) cache UPDATE
            const trackKey = makeTrackKey(song.song, song.artist);
            const now = new Date().toISOString();
            const { error: upErr } = await supabase
              .from("itunes_preview_cache")
              .update({
                preview_url: chosen.previewUrl,
                matched_track_name: chosen.trackName,
                matched_artist_name: chosen.artistName,
                match_score: 100,
                candidates_count: candidates.length,
                status: "matched_by_llm",
                last_attempted_at: now,
                matched_at: now,
              })
              .eq("track_key", trackKey);
            if (upErr) { errors++; }
            else { savedByLLM++; }
          }
        }
      }
    } catch (err) {
      errors++;
      console.error(`[X] ${song.song} - ${song.artist}: ${err.message}`);
    }

    processed++;
    if (processed % LOG_EVERY === 0 || processed === targets.length) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const remainingSec = (targets.length - processed) * (DELAY_MS + 1500) / 1000;
      console.log(
        `[${processed}/${targets.length}] saved:${savedByLLM} rejected:${llmRejected} dur_fail:${durationMismatch} err:${errors} ` +
          `| elapsed: ${fmtTime(elapsedSec)} / ETA: ${fmtTime(remainingSec)}`
      );
    }
    if (processed < targets.length) {
      await sleep(DELAY_MS);
      if (processed % BATCH_SIZE === 0) {
        console.log(`  ... ${BATCH_REST_MS / 1000}초 휴식 (batch ${processed / BATCH_SIZE} 완료)`);
        await sleep(BATCH_REST_MS);
      }
    }
  }

  // 3. 최종 통계
  console.log("---");
  console.log("✅ LLM 매칭 완료");
  console.log(`  대상: ${targets.length}곡`);
  console.log(`  LLM 매칭됨:        ${savedByLLM}곡 (status='matched_by_llm')`);
  console.log(`  LLM 거부 (=0/null): ${llmRejected}곡`);
  console.log(`  duration 불일치:    ${durationMismatch}곡`);
  console.log(`  errors:            ${errors}곡`);
  console.log(`  실행 시간: ${fmtTime((Date.now() - startedAt) / 1000)}`);

  // 4. DB 최종
  const { data: finalStats } = await supabase
    .from("itunes_preview_cache")
    .select("status");
  const counts = {};
  for (const r of finalStats ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("---");
  console.log("DB 캐시 status 분포:");
  for (const [status, n] of Object.entries(counts)) console.log(`  ${status}: ${n}`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const matchedAll = (counts.matched ?? 0) + (counts.matched_by_duration ?? 0) + (counts.matched_by_llm ?? 0);
  console.log(`  ───────────────────────`);
  console.log(`  전체 매칭률: ${matchedAll} / ${total} = ${(matchedAll * 100 / total).toFixed(1)}%`);
}

main().catch((err) => { console.error("[FATAL]", err); process.exit(1); });
