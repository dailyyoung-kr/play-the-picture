import { NextRequest, NextResponse } from "next/server";

// 정규화: 괄호·특수문자·공백 제거 + 소문자
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")      // (feat. ...), (Remix), (Instrumental) 등 제거
    .replace(/\[.*?\]/g, "")       // [Bonus Track] 등 제거
    .replace(/[^\p{L}\p{N}]/gu, "") // 문자/숫자 외 모두 제거
    .trim();
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  if (!title || !artist) {
    return NextResponse.json({ previewUrl: null }, { status: 400 });
  }

  const term = `${artist} ${title}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=kr`;

  try {
    // 3초 타임아웃
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ previewUrl: null });
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ previewUrl: null });
    }

    // 점수 기준 정렬
    type Candidate = {
      trackName: string;
      artistName: string;
      previewUrl?: string;
    };
    const scored = (data.results as Candidate[])
      .map((r) => ({
        r,
        score: scoreMatch(title, artist, r.trackName, r.artistName),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    // 최소 점수 60점 (제목+아티스트 둘 다 어느정도 맞아야)
    if (!best || best.score < 60 || !best.r.previewUrl) {
      return NextResponse.json({ previewUrl: null });
    }

    return NextResponse.json({
      previewUrl: best.r.previewUrl,
      trackName: best.r.trackName,
      artistName: best.r.artistName,
    });
  } catch {
    return NextResponse.json({ previewUrl: null });
  }
}
