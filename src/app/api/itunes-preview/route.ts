import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 캐시 재시도 임계값: 실패 캐시는 24시간 지나면 다시 호출
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

// 정규화: 괄호·특수문자·공백 제거 + 소문자
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")      // (feat. ...), (Remix), (Instrumental) 등 제거
    .replace(/\[.*?\]/g, "")       // [Bonus Track] 등 제거
    .replace(/[^\p{L}\p{N}]/gu, "") // 문자/숫자 외 모두 제거
    .trim();
}

// track_key 생성 (캐시 조회 키)
function makeTrackKey(title: string, artist: string): string {
  return `${normalize(title)}|${normalize(artist)}`;
}

// 매칭 점수: 아티스트·트랙 이름 일치 여부
function scoreMatch(
  targetTitle: string,
  targetArtist: string,
  candTitle: string,
  candArtist: string
): number {
  const nT = normalize(targetTitle);
  const nA = normalize(targetArtist);
  const cT = normalize(candTitle);
  const cA = normalize(candArtist);

  // 인스트루멘탈/리믹스는 감점 (원곡 우선)
  const isInst =
    /instrumental|inst\./i.test(candTitle) ||
    /remix|version/i.test(candTitle);

  let score = 0;
  // 트랙명 완전 일치 > 포함 > 불일치
  if (cT === nT) score += 50;
  else if (cT.includes(nT) || nT.includes(cT)) score += 30;

  // 아티스트명 완전 일치 > 포함
  if (cA === nA) score += 50;
  else if (cA.includes(nA) || nA.includes(cA)) score += 30;

  if (isInst) score -= 15;

  return score;
}

// iTunes API 호출 + 점수 매김
type ItunesResult = {
  previewUrl: string | null;
  matchedTrackName: string | null;
  matchedArtistName: string | null;
  matchScore: number | null;
  candidatesCount: number;
  status: "matched" | "low_score" | "no_results" | "error";
};

async function fetchFromItunes(title: string, artist: string): Promise<ItunesResult> {
  const term = `${artist} ${title}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=kr`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { previewUrl: null, matchedTrackName: null, matchedArtistName: null, matchScore: null, candidatesCount: 0, status: "error" };
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      return { previewUrl: null, matchedTrackName: null, matchedArtistName: null, matchScore: null, candidatesCount: 0, status: "no_results" };
    }

    type Candidate = { trackName: string; artistName: string; previewUrl?: string };
    const scored = (data.results as Candidate[])
      .map((r) => ({ r, score: scoreMatch(title, artist, r.trackName, r.artistName) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const candidatesCount = data.results.length;

    if (!best || best.score < 60 || !best.r.previewUrl) {
      return {
        previewUrl: null,
        matchedTrackName: best?.r.trackName ?? null,
        matchedArtistName: best?.r.artistName ?? null,
        matchScore: best?.score ?? null,
        candidatesCount,
        status: "low_score",
      };
    }

    return {
      previewUrl: best.r.previewUrl,
      matchedTrackName: best.r.trackName,
      matchedArtistName: best.r.artistName,
      matchScore: best.score,
      candidatesCount,
      status: "matched",
    };
  } catch {
    return { previewUrl: null, matchedTrackName: null, matchedArtistName: null, matchScore: null, candidatesCount: 0, status: "error" };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  if (!title || !artist) {
    return NextResponse.json({ previewUrl: null }, { status: 400 });
  }

  const trackKey = makeTrackKey(title, artist);

  // ── 1. 캐시 조회 ──
  type CachedRow = {
    attempts: number | null;
    status: string;
    preview_url: string | null;
    matched_track_name: string | null;
    matched_artist_name: string | null;
    match_score: number | null;
    last_attempted_at: string;
  };
  let cached: CachedRow | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("itunes_preview_cache")
      .select("attempts, status, preview_url, matched_track_name, matched_artist_name, match_score, last_attempted_at")
      .eq("track_key", trackKey)
      .maybeSingle();
    cached = data as CachedRow | null;

    if (cached) {
      const ageMs = Date.now() - new Date(cached.last_attempted_at).getTime();
      const isMatched = cached.status === "matched" && cached.preview_url;
      const canSkipRetry = isMatched || ageMs < RETRY_AFTER_MS;

      if (canSkipRetry) {
        return NextResponse.json({
          previewUrl: cached.preview_url ?? null,
          trackName: cached.matched_track_name,
          artistName: cached.matched_artist_name,
          score: cached.match_score,
          cache_hit: true,
        });
      }
    }
  } catch {
    // 캐시 조회 실패 시 그냥 외부 API 호출로 fallback
  }

  // ── 2. iTunes API 호출 ──
  const result = await fetchFromItunes(title, artist);

  // ── 3. 캐시 저장 (best-effort, 실패해도 응답은 정상 반환) ──
  try {
    const now = new Date().toISOString();
    const newAttempts = cached ? (cached.attempts ?? 0) + 1 : 1;

    await supabaseAdmin.from("itunes_preview_cache").upsert(
      {
        track_key: trackKey,
        song: title,
        artist: artist,
        preview_url: result.previewUrl,
        matched_track_name: result.matchedTrackName,
        matched_artist_name: result.matchedArtistName,
        match_score: result.matchScore,
        candidates_count: result.candidatesCount,
        search_country: "kr",
        status: result.status,
        attempts: newAttempts,
        last_attempted_at: now,
        matched_at: result.status === "matched" ? now : null,
        // first_attempted_at: payload에 안 넣어 INSERT 시 default(now()) 사용, UPDATE 시 기존 값 유지
      },
      { onConflict: "track_key" }
    );
  } catch {
    // 캐시 저장 실패는 무시 (운영에 영향 X)
  }

  return NextResponse.json({
    previewUrl: result.previewUrl,
    trackName: result.matchedTrackName,
    artistName: result.matchedArtistName,
    score: result.matchScore,
    cache_hit: false,
  });
}
