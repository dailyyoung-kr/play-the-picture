import { NextRequest, NextResponse } from "next/server";

// 외부 이미지 proxy — modern-screenshot이 SVG foreignObject로 변환할 때
// CORS 헤더 없는 외부 이미지(Spotify album art 등)를 같은 도메인에서 가져오도록 우회.

// 보안 가드: 허용 도메인 화이트리스트 (SSRF / Open Redirect 차단)
const ALLOWED_HOSTNAMES = new Set([
  "i.scdn.co",              // Spotify album art CDN (메인)
  "mosaic.scdn.co",         // Spotify mosaic
  "is1-ssl.mzstatic.com",   // iTunes / Apple Music
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
]);

export async function GET(req: NextRequest) {
  const urlParam = new URL(req.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "유효하지 않은 URL" }, { status: 400 });
  }

  // https만 허용
  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "https만 허용" }, { status: 400 });
  }

  // 화이트리스트 도메인만 허용
  if (!ALLOWED_HOSTNAMES.has(target.hostname)) {
    return NextResponse.json({ error: "허용되지 않은 도메인" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      // Vercel edge에서 캐시 (같은 URL은 한 번만 외부 호출)
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "upstream 실패" }, { status: 502 });
    }

    const contentType = upstream.headers.get("Content-Type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 아님" }, { status: 415 });
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        // 1일 캐시 (vercel edge + 브라우저)
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        // SVG foreignObject가 같은 origin으로 보도록 CORS 허용
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("[proxy-image] 오류:", e);
    return NextResponse.json({ error: "fetch 실패" }, { status: 502 });
  }
}
