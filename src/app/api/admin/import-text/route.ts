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
  explicit: boolean;
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
    youtubeVideoId: string | null;  // YouTube 동영상 ID (듣기 버튼 딥링크용)
    inputSong: string;      // 사용자 입력 곡명
    inputArtist: string;    // 사용자 입력 아티스트
    spotifySong: string;    // Spotify 반환 곡명 (검색 추적용)
    spotifyArtist: string;  // Spotify 반환 아티스트 (검색 추적용)
    album: string;
    duration: string;
    albumArtUrl: string | null;
    queryLine: string;
  };

  // YouTube 검색 (실패해도 에러 없이 null 반환 — Spotify 저장은 계속 진행)
  const YT_BLOCK_KEYWORDS = ["news", "breaking", "속보", "참사", "사고", "재난", "사망", "뉴스", "warning", "live breaking"];
  async function searchYouTubeVideo(query: string): Promise<string | null> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id,snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=5&order=relevance&key=${apiKey}`
      );
      if (!res.ok) {
        console.log("[import-text] YouTube 응답 오류:", res.status);
        return null;
      }
      const data = await res.json();
      const items = data.items ?? [];
      const filtered = items.filter((v: { snippet: { title: string } }) => {
        const title = (v.snippet?.title ?? "").toLowerCase();
        return !YT_BLOCK_KEYWORDS.some((kw) => title.includes(kw));
      });
      return filtered[0]?.id?.videoId ?? null;
    } catch {
      return null;
    }
  }

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
          // Spotify 찾은 곡만 YouTube도 검색 (실제 곡명+아티스트로 정확도↑)
          const ytQuery = `${track.name} ${track.artists.map(a => a.name).join(" ")}`.trim();
          const youtubeVideoId = await searchYouTubeVideo(ytQuery);
          console.log(`[import-text] YouTube: ${ytQuery} → ${youtubeVideoId ?? "null"}`);

          found.push({
            spotifyTrackId: track.id,
            youtubeVideoId,
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
genre 분류 기준 :
- kpop: 한국 아이돌/메이저 팝 + 한국 메이저 밴드
  * 아이돌: BTS, BLACKPINK, 에스파, ILLIT, RIIZE, TWICE, NewJeans, 세븐틴,
           IVE, NMIXX, LE SSERAFIM, Stray Kids, TWS, BOYNEXTDOOR, NCT
  * 메이저 솔로: 아이유, 태연, 도경수, 백현, G-DRAGON, 전소미
  * 메이저 밴드: DAY6, LUCY
- pop: 글로벌 메인스트림 팝 (영미권/일본 메이저)
  * 글로벌 TOP: Taylor Swift, Ed Sheeran, Dua Lipa, Ariana Grande, Sabrina Carpenter,
              Billie Eilish, Olivia Rodrigo, Bruno Mars, Charlie Puth, The Weeknd
  * 감성 팝: Dean Lewis, Jamie Miller, Lauv, Lewis Capaldi, Jeremy Zucker, Alec Benjamin
  * 일본 J-pop 메이저: 宇多田ヒカル, Fujii Kaze (통합 팝으로)
- hiphop: 힙합/랩/로파이/재즈힙합 (장르 성격이 랩이거나 lofi 비트 중심)
  * 글로벌: Kendrick Lamar, Kanye West, Drake, Tyler The Creator, Playboi Carti,
          Travis Scott, Kid Cudi, Mac Miller, Post Malone, Don Toliver, J.Cole
  * 한국: 박재범, 지코, 창모, 이센스, 염따, ASH ISLAND, 쿠기, 식케이, 에픽하이,
         펀치넬로, 페노메코, 김하온, B.I, 타블로, 비비
  * Lofi/재즈힙합: Nujabes, Marcus D, Kyo Itachi, Emapea, Jazz Liberatorz
- indie: 한국 인디/밴드/싱어송라이터 + 글로벌 인디/얼터너티브 + J-pop/J-rock
  * 한국 인디: 검정치마, 잔나비, 혁오, 새소년, 선우정아, 적재, 소란,
              에피톤 프로젝트, 뎁트, 모트, 짙은, 실리카겔, 10CM, 카더가든,
              데이먼스 이어, 경서, 호아, 우효, HANRORO, LUCY
  * 글로벌 인디: LANY, The 1975, Phoebe Bridgers, Clairo, Lizzy McAlpine,
                keshi, yung kai, Ruth B, HYBS, d4vd, HONNE
  * 일본 J-rock/J-pop: YOASOBI, Vaundy, King Gnu, Official髭男dism,
                     Mrs. GREEN APPLE, 米津玄師, あいみょん
- rnb: R&B/소울 (장르 성격 중요 — 한국 아티스트도 R&B면 kpop 아님)
  * 글로벌: Daniel Caesar, SZA, Frank Ocean, Bruno Mars (R&B 곡), Steve Lacy,
          The Weeknd (R&B 곡), Khalid, Chris Brown, USHER, Beyoncé, Rihanna,
          Omar Apollo, Alina Baraz, Jhené Aiko, Kehlani
  * 한국: Crush, 딘, 차우, 죠지, 백예린, Colde, JUNNY, DPR IAN, offonoff,
         문수진, 고요, 다운, Zion.T, 정기고, 헨리, THAMA
- acoustic_jazz: 어쿠스틱/재즈/보사노바/영화 OST 재즈
  * 재즈 클래식: Frank Sinatra, Nat King Cole, Ella Fitzgerald, Louis Armstrong,
              Sarah Vaughan, Nina Simone, Duke Jordan
  * 현대 재즈/보사노바: Bruno Major, Norah Jones, Suchmos, 윤석철트리오,
                     Maria Kim, Haewon Moon, 나윤선, 웅산
  * OST: Ryan Gosling (La La Land), Justin Hurwitz
  * 어쿠스틱 싱어송라이터: Fujii Kaze (어쿠스틱 곡 한정), grentperez
【애매한 경계 처리 규칙】
1. 한국 아티스트 중 애매하면: 대형 기획사 소속 or 아이돌 → kpop / 싱어송라이터·밴드 → indie
2. R&B vs hiphop: 랩 비중 높으면 hiphop, 보컬 중심이면 rnb
3. pop vs indie: 빌보드 TOP 40급 글로벌 히트 → pop, 그 아래 → indie
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
    youtube_video_id: t.youtubeVideoId,
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

  // added_songs — 클라이언트에서 백그라운드 미리듣기 매칭 트리거 (cache 자동 채움)
  const addedSongs = rows.map((r) => ({ song: r.song, artist: r.artist }));

  return NextResponse.json({
    success: newFound.length,
    failed,
    duplicates,
    added_songs: addedSongs,
    total: lines.length,
    genreBreakdown,
  });
}
