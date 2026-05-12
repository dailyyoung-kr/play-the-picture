// Kakao OAuth 통합 helper
// Supabase 표준 OAuth provider 아니라 우리가 직접 token 교환·user info fetch
// REST API 키는 client_id 역할 (브라우저 노출 OK), CLIENT_SECRET은 서버 전용

const KAKAO_REST_API_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "";
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET ?? "";
const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ?? "";

export type KakaoTokenResponse = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export type KakaoUserInfo = {
  id: string; // 카카오 회원번호 (numeric → string으로 정규화)
  nickname?: string;
  profileImage?: string;
  email?: string;
};

export function isKakaoConfigured(): boolean {
  return !!KAKAO_REST_API_KEY && !!KAKAO_CLIENT_SECRET && !!KAKAO_REDIRECT_URI;
}

// Kakao 인증 시작 URL — state에 device_id·merge_from 등 caller가 만든 페이로드 포함
export function getKakaoAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: KAKAO_REDIRECT_URI,
    response_type: "code",
    // openid scope 포함 → ID token 발급. profile·email은 동의 항목 설정 따라 결정
    scope: "openid profile_nickname account_email",
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

// 인가 code → 토큰 교환 (서버 전용 — client_secret 사용)
export async function exchangeKakaoCode(code: string): Promise<KakaoTokenResponse> {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KAKAO_REST_API_KEY,
      client_secret: KAKAO_CLIENT_SECRET,
      redirect_uri: KAKAO_REDIRECT_URI,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Kakao token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// access_token으로 카카오 사용자 정보 조회
export async function fetchKakaoUser(accessToken: string): Promise<KakaoUserInfo> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Kakao user fetch failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return {
    id: String(data.id),
    nickname: data.kakao_account?.profile?.nickname,
    profileImage: data.kakao_account?.profile?.profile_image_url,
    email: data.kakao_account?.email,
  };
}
