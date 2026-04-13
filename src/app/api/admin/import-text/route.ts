import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function getClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    console.log("[import-text] client_credentials 실패:", res.status);
    return null;
  }
  const data = await res.json();
  return data.access_token ?? null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  album: { name: string; images: { url: string }[] };
  artists: { name: string }[];
};

export async function POST(req: NextRequest) {
  const { songs, genre } = await req.json();

  if (!songs || typeof songs !== "string") {
    return NextResponse.json({ error: "songs 입력이 필요해요." }, { status: 400 });
  }

  // 줄 단위 파싱
  const lines = songs
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  if (lines.length === 0) {
    return NextResponse.json({ error: "곡 목록이 비어있어요." }, { status: 400 });
  }

  // Spotify client_credentials 토큰
  const token = await getClientCredentialsToken();
  if (!token) {
    return NextResponse.json({ error: "Spotify 토큰 발급 실패. SPOTIFY_CLIENT_ID/SECRET 확인 필요." }, { status: 500 });
  }

  type FoundTrack = {
    spotifyTrackId: string;
    inputSong: string;      // 사용자 입력 곡명
    inputArtist: string;    // 사용자 입력 아티스트
    spotifySong: string;    // Spotify 반환 곡명 (검색 추적용)
    spotifyArtist: string;  // Spotify 반환 아티스트 (검색 추적용)
    album: string;
    duration: string;
    albumArtUrl: string | null;
    queryLine: string;
  };

  const found: FoundTrack[] = [];
  const failed: string[] = [];

  // 순차 처리 (병렬 금지)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dashIdx = line.indexOf(" - ");
    let trackName: string;
    let artistName: string;

    if (dashIdx !== -1) {
      trackName = line.slice(0, dashIdx).trim();
      artistName = line.slice(dashIdx + 3).trim();
    } else {
      trackName = line;
      artistName = "";
    }

    const q = artistName
      ? `track:${encodeURIComponent(trackName)}+artist:${encodeURIComponent(artistName)}`
      : encodeURIComponent(trackName);

    try {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1&market=KR`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        console.log(`[import-text] 검색 실패 (${res.status}): ${line}`);
        failed.push(line);
      } else {
        const data = await res.json();
        const track: SpotifyTrack | undefined = data.tracks?.items?.[0];
        if (!track) {
          console.log(`[import-text] 검색 결과 없음: ${line}`);
          failed.push(line);
        } else {
          found.push({
            spotifyTrackId: track.id,
            inputSong: trackName,
            inputArtist: artistName,
            spotifySong: track.name,
            spotifyArtist: track.artists.map(a => a.name).join(", "),
            album: track.album.name,
            duration: formatDuration(track.duration_ms),
            albumArtUrl: track.album.images[0]?.url ?? null,
            queryLine: line,
          });
        }
      }
    } catch {
      console.log(`[import-text] 네트워크 오류: ${line}`);
      failed.push(line);
    }

    // rate limit 방지: 마지막 곡 제외 1000ms 딜레이
    if (i < lines.length - 1) {
      await sleep(1000);
      // 30곡마다 30초 대기 (예: 30번째 곡 처리 후)
      if ((i + 1) % 30 === 0) {
        console.log(`[import-text] 30곡 처리 완료 (${i + 1}곡째) → 30초 대기`);
        await sleep(30000);
      }
    }
  }

  if (found.length === 0) {
    return NextResponse.json({ success: 0, failed, total: lines.length });
  }

  // Claude 태깅 (energy + 자동 분류 시 genre도 함께)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API 키 없음" }, { status: 500 });
  }
  const client = new Anthropic({ apiKey });

  const isAutoGenre = genre === "auto";
  const songList = found.map((t, i) => `${i}: ${t.spotifySong} - ${t.spotifyArtist}`).join("\n");

  const prompt = isAutoGenre
    ? `아래 곡 목록에 energy 값(1~5)과 genre를 붙여줘.

energy: 1=잔잔, 2=여유, 3=설렘, 4=신남, 5=파워풀

genre 분류 기준:
- kpop: K-Pop 메이저 아티스트 (아이유, BTS, 에스파, 케이시, 볼빨간사춘기, 멜로망스, 도경수, 태연, 성시경, 다비치 등)
- pop: 글로벌 팝 (Ed Sheeran, Taylor Swift, Dua Lipa 등)
- hiphop: 힙합/랩 (한국+글로벌)
- indie: 인디/얼터너티브/포크/락 (적재, 소란, 에피톤 프로젝트, 선우정아, 뎁트, 모트, 짙은, 실리카겔, 데이식스, The 1975 등)
- rnb: R&B/소울 (Crush, 딘, 차우 등)
- acoustic_jazz: 어쿠스틱/재즈/보사노바

JSON 배열로만 응답. 각 항목: {"index": N, "energy": N, "genre": "값"}

${songList}`
    : `아래 곡 목록에 energy 값(1~5)을 붙여줘.
1=잔잔, 2=여유, 3=설렘, 4=신남, 5=파워풀
JSON 배열로만 응답. 각 항목: {"index": N, "energy": N}

${songList}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  const VALID_GENRES = new Set(["kpop", "pop", "hiphop", "indie", "rnb", "acoustic_jazz"]);
  let energyMap: Record<number, number> = {};
  let genreMap: Record<number, string> = {};
  try {
    const arr = JSON.parse(cleaned) as { index: number; energy: number; genre?: string }[];
    for (const item of arr) {
      energyMap[item.index] = Math.min(5, Math.max(1, item.energy));
      if (isAutoGenre && item.genre && VALID_GENRES.has(item.genre)) {
        genreMap[item.index] = item.genre;
      }
    }
  } catch {
    // fallback: energy=3, genre=kpop
  }

  // 중복 확인: 이미 DB에 있는 spotify_track_id 조회
  const foundTrackIds = found.map(t => t.spotifyTrackId);
  const { data: existingRows } = await supabaseAdmin
    .from("songs")
    .select("spotify_track_id, song, artist, genre")
    .in("spotify_track_id", foundTrackIds);

  const existingMap = new Map<string, { song: string; artist: string; genre: string }>(
    (existingRows ?? []).map(r => [r.spotify_track_id, { song: r.song, artist: r.artist, genre: r.genre }])
  );

  const duplicates: { song: string; artist: string; existingGenre: string }[] = [];
  const newFound = found.filter((t, i) => {
    if (existingMap.has(t.spotifyTrackId)) {
      const existing = existingMap.get(t.spotifyTrackId)!;
      duplicates.push({ song: t.inputSong || t.spotifySong, artist: t.inputArtist || t.spotifyArtist, existingGenre: existing.genre });
      console.log(`[import-text] 중복 스킵: ${t.spotifySong} - ${t.spotifyArtist} (기존 장르: ${existing.genre})`);
      return false;
    }
    return true;
  });

  console.log(`[import-text] 신규: ${newFound.length}곡, 중복: ${duplicates.length}곡`);

  if (newFound.length === 0) {
    return NextResponse.json({
      success: 0,
      failed,
      duplicates,
      total: lines.length,
      genreBreakdown: {},
    });
  }

  // 신규 곡만 insert (newFound의 index가 found 배열에서의 원래 인덱스와 달라졌으므로 재매핑)
  const newFoundIndices = found
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !existingMap.has(t.spotifyTrackId));

  const rows = newFoundIndices.map(({ t, i }) => ({
    spotify_track_id: t.spotifyTrackId,
    song: t.inputSong,
    artist: t.inputArtist || t.spotifyArtist,
    spotify_query_song: t.spotifySong,
    spotify_query_artist: t.spotifyArtist,
    album: t.album,
    duration: t.duration,
    genre: isAutoGenre ? (genreMap[i] ?? "kpop") : (genre ?? "kpop"),
    energy: energyMap[i] ?? 3,
    album_art_url: t.albumArtUrl,
  }));

  const { error } = await supabaseAdmin
    .from("songs")
    .insert(rows);

  if (error) {
    console.log("[import-text] Supabase insert 오류:", error.message);
    return NextResponse.json({ error: "DB 저장 실패: " + error.message }, { status: 500 });
  }

  // 장르별 곡 수 집계
  const genreBreakdown: Record<string, number> = {};
  for (const row of rows) {
    genreBreakdown[row.genre] = (genreBreakdown[row.genre] ?? 0) + 1;
  }

  return NextResponse.json({
    success: newFound.length,
    failed,
    duplicates,
    total: lines.length,
    genreBreakdown,
  });
}
