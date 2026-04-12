import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SPOTIFY_CLIENT_ID 없음" }, { status: 500 });
  }

  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ??
    "http://localhost:3000/api/admin/spotify-callback";

  const scope = "playlist-read-private playlist-read-collaborative";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
