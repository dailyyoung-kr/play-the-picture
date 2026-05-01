import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      status: "token_failed",
      checkedAt: Date.now(),
      retryAfter: null,
    });
  }

  // 1. 토큰 발급
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    return NextResponse.json({
      status: "token_failed",
      checkedAt: Date.now(),
      retryAfter: null,
    });
  }

  const { access_token } = await tokenRes.json();

  // 2. 검색 테스트
  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?q=IU&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (searchRes.status === 429) {
    const retryAfter = parseInt(searchRes.headers.get("Retry-After") ?? "0", 10);
    return NextResponse.json({
      status: "rate_limited",
      checkedAt: Date.now(),
      retryAfter,
    });
  }

  if (!searchRes.ok) {
    return NextResponse.json({
      status: "token_failed",
      checkedAt: Date.now(),
      retryAfter: null,
    });
  }

  return NextResponse.json({
    status: "ok",
    checkedAt: Date.now(),
    retryAfter: null,
  });
}
