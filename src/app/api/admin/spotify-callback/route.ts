import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const TOKENS_PATH = path.join(process.cwd(), ".spotify-tokens.json");
const ENV_PATH = path.join(process.cwd(), ".env.local");

function updateEnvLocal(key: string, value: string) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return new NextResponse(errorPage(error ?? "인증이 취소됐어요"), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Spotify 자격증명 없음" }, { status: 500 });
  }

  const redirectUri = "http://localhost:3000/api/admin/spotify-callback";

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[spotify-callback] 토큰 교환 실패:", res.status, body);
    return new NextResponse(errorPage("토큰 교환 실패: " + res.status), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const data = await res.json();
  const { access_token, refresh_token, expires_in } = data;

  // .spotify-tokens.json에 저장 (런타임 참조용)
  fs.writeFileSync(
    TOKENS_PATH,
    JSON.stringify(
      {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + expires_in * 1000,
      },
      null,
      2
    ),
    "utf-8"
  );

  // .env.local에도 저장 (재시작 후에도 유지)
  updateEnvLocal("SPOTIFY_ACCESS_TOKEN", access_token);
  updateEnvLocal("SPOTIFY_REFRESH_TOKEN", refresh_token);

  console.log("[spotify-callback] 토큰 저장 완료. expires_in:", expires_in);

  return new NextResponse(successPage(), {
    headers: { "Content-Type": "text/html" },
  });
}

function successPage() {
  return `<!DOCTYPE html>
<html>
<body style="background:#0d1218;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div>
    <div style="font-size:52px;margin-bottom:16px;color:#C4687A">✓</div>
    <p style="font-size:18px;font-weight:600;margin:0 0 8px">Spotify 연결 완료!</p>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0">이 창을 닫고 어드민 페이지로 돌아가세요</p>
  </div>
</body>
</html>`;
}

function errorPage(msg: string) {
  return `<!DOCTYPE html>
<html>
<body style="background:#0d1218;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div>
    <div style="font-size:52px;margin-bottom:16px">✗</div>
    <p style="font-size:18px;font-weight:600;margin:0 0 8px">연결 실패</p>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0">${msg}</p>
  </div>
</body>
</html>`;
}
