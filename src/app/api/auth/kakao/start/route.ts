import { NextRequest, NextResponse } from "next/server";
import { getKakaoAuthorizeUrl, isKakaoConfigured } from "@/lib/auth/kakao";

// GET /api/auth/kakao/start?device_id=...&merge_from=...&action=signin|link
// 카카오 인증 URL로 redirect. state에 후속 callback에서 쓸 페이로드를 base64로 인코딩.
export async function GET(req: NextRequest) {
  if (!isKakaoConfigured()) {
    return NextResponse.redirect(`${req.nextUrl.origin}/?auth_error=kakao_not_configured`);
  }

  const deviceId = req.nextUrl.searchParams.get("device_id") ?? "";
  const mergeFrom = req.nextUrl.searchParams.get("merge_from") ?? "";
  const action = req.nextUrl.searchParams.get("action") ?? "signin"; // signin | link
  const native = req.nextUrl.searchParams.get("native") === "1"; // iOS·Android 앱 deep link 모드

  // state payload — 카카오는 state 그대로 callback에 다시 넘김
  const statePayload = JSON.stringify({ device_id: deviceId, merge_from: mergeFrom, action, native });
  // base64url 인코딩 — URL-safe하고 카카오에 그대로 전달 가능
  const state = Buffer.from(statePayload, "utf8").toString("base64url");

  return NextResponse.redirect(getKakaoAuthorizeUrl(state));
}
