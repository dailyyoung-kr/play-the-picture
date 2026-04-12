import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const TOKENS_PATH = path.join(process.cwd(), ".spotify-tokens.json");
const ENV_PATH = path.join(process.cwd(), ".env.local");

function tryWriteFiles(accessToken: string, refreshToken: string, expiresIn: number) {
  // Vercel 등 read-only 환경에서는 그냥 skip
  try {
    fs.writeFileSync(
      TOKENS_PATH,
      JSON.stringify(
        { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 },
        null,
        2
      ),
      "utf-8"
    );

    let envContent = fs.existsSync(ENV_PATH)
      ? fs.readFileSync(ENV_PATH, "utf-8")
      : "";
    const updateKey = (content: string, key: string, value: string) => {
      const regex = new RegExp(`^${key}=.*$`, "m");
      return regex.test(content)
        ? content.replace(regex, `${key}=${value}`)
        : content.trimEnd() + `\n${key}=${value}\n`;
    };
    envContent = updateKey(envContent, "SPOTIFY_ACCESS_TOKEN", accessToken);
    envContent = updateKey(envContent, "SPOTIFY_REFRESH_TOKEN", refreshToken);
    fs.writeFileSync(ENV_PATH, envContent, "utf-8");

    console.log("[spotify-callback] 파일 저장 완료 (로컬)");
  } catch (e) {
    // Vercel read-only 환경 — 파일 저장 불가, 무시
    console.log("[spotify-callback] 파일 저장 skip (Vercel 환경):", (e as Error).message);
  }
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

  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ??
    "http://localhost:3000/api/admin/spotify-callback";

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
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

  tryWriteFiles(access_token, refresh_token, expires_in);
  console.log("[spotify-callback] 완료. expires_in:", expires_in);

  return new NextResponse(
    successPage(access_token, refresh_token),
    { headers: { "Content-Type": "text/html" } }
  );
}

function successPage(accessToken: string, refreshToken: string) {
  return `<!DOCTYPE html>
<html>
<body style="background:#0d1218;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box">
  <div style="max-width:480px;width:100%">
    <div style="font-size:52px;margin-bottom:16px;color:#1DB954">✓</div>
    <p style="font-size:18px;font-weight:600;margin:0 0 8px">Spotify 연결 완료!</p>
    <p style="color:rgba(255,255,255,0.45);font-size:13px;margin:0 0 28px">
      로컬에서는 파일에 저장됐어요.<br>
      Vercel 배포 환경이라면 아래 값을 환경변수로 등록하세요.
    </p>
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;text-align:left;margin-bottom:12px">
      <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 8px">SPOTIFY_ACCESS_TOKEN</p>
      <p style="font-size:11px;color:#a0f0b0;word-break:break-all;margin:0;font-family:monospace">${accessToken}</p>
    </div>
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;text-align:left">
      <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 8px">SPOTIFY_REFRESH_TOKEN</p>
      <p style="font-size:11px;color:#a0f0b0;word-break:break-all;margin:0;font-family:monospace">${refreshToken}</p>
    </div>
    <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:16px 0 0">이 창을 닫고 어드민 페이지로 돌아가세요</p>
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
