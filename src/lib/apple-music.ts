/**
 * Apple Music API helper — "오늘의 발견" 기능용
 *
 * 인증: ES256 JWT (Media Services Key, 6개월 유효)
 * env: APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_KEY(production) | APPLE_MUSIC_KEY_PATH(local)
 *
 * 주요 endpoint:
 *  · search artists      : /v1/catalog/{storefront}/search?term=...&types=artists
 *  · get artist full     : /v1/catalog/{storefront}/artists/{id}?views=similar-artists,top-songs
 *  · playlist tracks     : /v1/catalog/{storefront}/playlists/{id}/tracks?limit=50
 */
import fs from "fs";
import jwt from "jsonwebtoken";

const STOREFRONT = "kr";

// 콜드 스타트 시드용 — Apple Music 큐레이션 한국 인디/R&B/시티팝 playlist 5개
export const CURATED_PLAYLISTS = [
  { id: "pl.8df10a3246544d35bf15a6589291b142", name: "Kool Indie" },
  { id: "pl.ea77dbfd10c64d1e8d1ab58a99a2acc8", name: "한국 시티 팝" },
  { id: "pl.2c470ab2cb66414682b100335afe72af", name: "Rewind: 한국 R&B" },
  { id: "pl.79aa62c2cd4d46e5bdaaa5346e909625", name: "칠 아웃 K-Pop" },
  { id: "pl.7a1d8bd609c44c318d71bf1a0a1e89b5", name: "오늘의 히트곡 발견" },
];

// ─────────────────────────── JWT ───────────────────────────

function getPrivateKey(): string {
  // production: env에 .p8 내용 직접 (개행은 \n으로 escape)
  if (process.env.APPLE_MUSIC_KEY) {
    return process.env.APPLE_MUSIC_KEY.replace(/\\n/g, "\n");
  }
  // local: 파일 경로
  if (process.env.APPLE_MUSIC_KEY_PATH) {
    return fs.readFileSync(process.env.APPLE_MUSIC_KEY_PATH, "utf-8");
  }
  throw new Error("APPLE_MUSIC_KEY 또는 APPLE_MUSIC_KEY_PATH 환경변수 필요");
}

let cachedToken: string | null = null;
let cachedTokenExp = 0;

export function getAppleMusicToken(): string {
  // 6개월 토큰 — 메모리 캐시. 만료 1시간 전 갱신
  if (cachedToken && Date.now() < cachedTokenExp - 60 * 60 * 1000) {
    return cachedToken;
  }
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  if (!teamId || !keyId) throw new Error("APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID 환경변수 필요");

  const token = jwt.sign({}, getPrivateKey(), {
    algorithm: "ES256",
    expiresIn: "180d",
    issuer: teamId,
    header: { alg: "ES256", kid: keyId },
  });
  cachedToken = token;
  cachedTokenExp = Date.now() + 180 * 24 * 60 * 60 * 1000;
  return token;
}

// ─────────────────────────── API helpers ───────────────────────────

async function appleFetch(path: string): Promise<unknown> {
  const token = getAppleMusicToken();
  const res = await fetch(`https://api.music.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.log(`[apple-music] ${res.status} ${path}`);
    return null;
  }
  return res.json();
}

type AppleArtistAttr = {
  name?: string;
  artwork?: { url?: string; width?: number; height?: number };
  genreNames?: string[];
};
type AppleArtistData = { id: string; attributes?: AppleArtistAttr };
type AppleTrackAttr = {
  name?: string;
  albumName?: string;
  releaseDate?: string;
  artwork?: { url?: string };
  previews?: { url?: string }[];
};
type AppleTrackData = { id: string; attributes?: AppleTrackAttr };

export async function appleSearchArtist(name: string): Promise<AppleArtistData | null> {
  const params = new URLSearchParams({ term: name, types: "artists", limit: "5" });
  const json = (await appleFetch(`/v1/catalog/${STOREFRONT}/search?${params}`)) as {
    results?: { artists?: { data?: AppleArtistData[] } };
  } | null;
  const items = json?.results?.artists?.data || [];
  // 정확 매칭 우선
  const exact = items.find((a) => a.attributes?.name?.toLowerCase() === name.toLowerCase());
  return exact || items[0] || null;
}

export type AppleArtistFull = {
  appleId: string;
  name: string;
  artwork: string | null; // 800x1000 url
  genres: string[];
  similar: { id: string; name: string }[];
  tracks: {
    id: string;
    name: string;
    album: string;
    year: string;
    art: string | null;
    preview: string | null;
  }[];
};

export async function appleGetArtistFull(id: string): Promise<AppleArtistFull | null> {
  const json = (await appleFetch(
    `/v1/catalog/${STOREFRONT}/artists/${id}?views=similar-artists,top-songs`,
  )) as {
    data?: {
      id: string;
      attributes?: AppleArtistAttr;
      views?: {
        "similar-artists"?: { data?: AppleArtistData[] };
        "top-songs"?: { data?: AppleTrackData[] };
      };
    }[];
  } | null;
  const data = json?.data?.[0];
  if (!data) return null;
  const attrs = data.attributes || {};
  const views = data.views || {};

  const similar = (views["similar-artists"]?.data || []).map((s) => ({
    id: s.id,
    name: s.attributes?.name || "",
  }));

  const tracks = (views["top-songs"]?.data || []).slice(0, 5).map((t) => {
    const ta = t.attributes || {};
    return {
      id: t.id,
      name: ta.name || "",
      album: ta.albumName || "",
      year: ta.releaseDate?.slice(0, 4) || "",
      art: ta.artwork?.url?.replace("{w}", "500").replace("{h}", "500") || null,
      preview: ta.previews?.[0]?.url || null,
    };
  });

  return {
    appleId: id,
    name: attrs.name || "",
    artwork: attrs.artwork?.url?.replace("{w}", "800").replace("{h}", "1000") || null,
    genres: attrs.genreNames || [],
    similar,
    tracks,
  };
}

export async function applePlaylistTracks(playlistId: string): Promise<{ artistName: string }[]> {
  const json = (await appleFetch(
    `/v1/catalog/${STOREFRONT}/playlists/${playlistId}/tracks?limit=50`,
  )) as { data?: { attributes?: { artistName?: string } }[] } | null;
  return (json?.data || [])
    .map((t) => ({ artistName: t.attributes?.artistName || "" }))
    .filter((t) => t.artistName);
}
