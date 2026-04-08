"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ShareEntry {
  id: string;
  song: string;
  artist: string;
  reason: string;
  tags: string[];
  emotions: {
    "행복함": number;
    "설레임": number;
    "에너지": number;
    "특별함": number;
  };
  vibe_type: string;
  vibe_description: string;
  photos: string[];
  album_art?: string | null;
}

const EMOTION_LABELS = [
  { key: "행복함" as const, emoji: "😊", label: "행복함", color: "#f0d080" },
  { key: "설레임" as const, emoji: "💗", label: "설레임", color: "#f0a0c0" },
  { key: "에너지" as const, emoji: "⚡", label: "에너지", color: "#a0d4f0" },
  { key: "특별함" as const, emoji: "✨", label: "특별함", color: "#a0f0b0" },
];

const PHOTO_COLORS = [
  "linear-gradient(160deg, #1a2a1a, #0a1a0a)",
  "linear-gradient(160deg, #2a2a3a, #1a1a2a)",
  "linear-gradient(160deg, #003850, #001830)",
];

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [entry, setEntry] = useState<ShareEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showListenSheet, setShowListenSheet] = useState(false);
  const [musicLinks, setMusicLinks] = useState<{
    spotifyUrl: string | null;
    youtubeUrl: string | null;
    spotifyFallback: string;
    youtubeFallback: string;
  } | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("entries")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setEntry(data as ShareEntry);
        }
      });
  }, [id]);

  const fetchMusicLinks = async (song: string, artist: string) => {
    setLoadingLinks(true);
    try {
      const params = new URLSearchParams({ song, artist });
      const res = await fetch(`/api/music-search?${params}`);
      const data = await res.json();
      setMusicLinks(data);
    } catch {
      setMusicLinks(null);
    } finally {
      setLoadingLinks(false);
    }
  };

  const handleListenClick = () => {
    setShowListenSheet(true);
    if (!musicLinks && entry) {
      fetchMusicLinks(entry.song, entry.artist);
    }
  };

  if (notFound) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
      >
        <div className="text-center px-8">
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, marginBottom: 8 }}>결과를 찾을 수 없어요</p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>링크가 만료됐거나 잘못됐어요</p>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "#C4687A",
              border: "none",
              borderRadius: 24,
              padding: "12px 32px",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            나도 해보기
          </button>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
      >
        <div className="text-center">
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  const songForShare = entry.song;
  const artistForShare = entry.artist;

  const platforms = [
    {
      name: "YouTube Music에서 듣기",
      url: musicLinks?.youtubeUrl ?? musicLinks?.youtubeFallback ?? `https://music.youtube.com/search?q=${encodeURIComponent(`${songForShare} ${artistForShare}`)}`,
      isDirect: !!musicLinks?.youtubeUrl,
      iconBg: "#FF0000",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <polygon points="9,6 20,12 9,18" />
        </svg>
      ),
    },
    {
      name: "Spotify에서 듣기",
      url: musicLinks?.spotifyUrl ?? musicLinks?.spotifyFallback ?? `https://open.spotify.com/search/${encodeURIComponent(`${songForShare} ${artistForShare}`)}`,
      isDirect: !!musicLinks?.spotifyUrl,
      iconBg: "#1DB954",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.713 1.115a.623.623 0 01.206.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.973c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.532-1.072 9.404-.865 13.115 1.338a.937.937 0 01-.955 1.613z"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>

      {/* 앨범아트 배경 */}
      {entry.album_art && (
        <>
          <div style={{
            position: "absolute",
            top: "-10%", left: "-10%", width: "120%", height: "120%",
            backgroundImage: `url(${entry.album_art})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(50px) brightness(0.25)",
          }} />
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
        </>
      )}

    <div
      className="min-h-screen flex flex-col"
      style={{ position: "relative", zIndex: 1, background: entry.album_art ? "transparent" : "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
    >
      {/* 상단 앱 이름 */}
      <div
        className="text-center pt-12 pb-3"
        style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)" }}
      >
        PLAY THE PICTURE
      </div>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto">

        {/* 공유 배지 */}
        <p className="text-center mb-3" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
          친구의 오늘
        </p>

        {/* 사진 3장 */}
        <div className="flex gap-2 justify-center mb-5">
          {(entry.photos.length > 0 ? entry.photos.slice(0, 3) : PHOTO_COLORS).map((src, i) => (
            <div
              key={i}
              style={{
                width: 100,
                height: 124,
                borderRadius: 10,
                border: "1.5px solid rgba(255,255,255,0.13)",
                flexShrink: 0,
                overflow: "hidden",
                background: typeof src === "string" && src.startsWith("data:") ? undefined : PHOTO_COLORS[i],
              }}
            >
              {src.startsWith("data:") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={`사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
          ))}
        </div>

        {/* 노래 정보 */}
        <div className="text-center mb-4">
          <h1 className="font-semibold mb-1" style={{ fontSize: 28, color: "#fff", letterSpacing: "-0.5px" }}>
            {entry.song}
          </h1>
          <p className="mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>
            {entry.artist}
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                #{tag.replace(/^#+/, "")}
              </span>
            ))}
          </div>
        </div>

        {/* 감정 분석 카드 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12 }}>
          <p className="mb-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>
            ✦ 오늘 하루 감정 분석
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {EMOTION_LABELS.map(({ key, emoji, label, color }) => {
              const pct = (entry.emotions as Record<string, number>)[key] ?? 0;
              return (
                <div
                  key={key}
                  style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                      {emoji} {label}
                    </span>
                    <span className="font-medium" style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {entry.vibe_type && (
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>사진으로 보는 오늘의 선곡</p>
              <p className="font-medium" style={{ fontSize: 15, color: "#a0f0b0", marginBottom: 4 }}>
                {entry.vibe_type}
              </p>
              {entry.vibe_description && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
                  {entry.vibe_description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 왜 이 노래? */}
        <div className="mb-5" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
          <p className="font-medium mb-2" style={{ fontSize: 10, color: "#f0d080", letterSpacing: "0.05em" }}>
            왜 이 노래?
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
            {entry.reason}
          </p>
        </div>

      </div>

      <div className="px-5">
        {/* 지금 바로 듣기 */}
        <button
          className="w-full font-medium mb-2"
          style={{ background: "#fff", border: "none", borderRadius: 24, padding: 14, color: "#0d1218", fontSize: 14, cursor: "pointer" }}
          onClick={handleListenClick}
        >
          ▶  지금 바로 듣기
        </button>

        {/* 나도 해보기 */}
        <button
          className="w-full font-medium mb-5"
          onClick={() => router.push("/")}
          style={{
            background: "#C4687A",
            border: "none",
            borderRadius: 24,
            padding: 14,
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          나도 해보기 ✦
        </button>
      </div>

      {/* 듣기 바텀시트 */}
      {showListenSheet && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
            onClick={() => setShowListenSheet(false)}
          />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: "rgba(13,18,24,0.98)",
            borderRadius: "20px 20px 0 0",
            padding: "12px 20px 40px",
            zIndex: 61,
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, margin: "0 auto 20px" }} />

            <p className="font-medium text-center" style={{ fontSize: 16, color: "#fff", marginBottom: 10 }}>
              어디서 들을까?
            </p>

            <div className="flex justify-center mb-5">
              <span style={{
                background: "rgba(196,104,122,0.18)",
                border: "1px solid rgba(196,104,122,0.4)",
                color: "#C4687A",
                fontSize: 12,
                padding: "4px 14px",
                borderRadius: 20,
              }}>
                {songForShare}{artistForShare ? ` — ${artistForShare}` : ""}
              </span>
            </div>

            {loadingLinks && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 12 }}>
                🎵 링크 찾는 중...
              </div>
            )}

            <div className="flex flex-col" style={{ gap: 8, marginBottom: 12 }}>
              {platforms.map((p) => (
                <a
                  key={p.name}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    height: 60,
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "0 16px",
                    textDecoration: "none",
                    opacity: loadingLinks ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: p.iconBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, color: "#fff", display: "block" }}>{p.name}</span>
                    {!loadingLinks && (
                      <span style={{ fontSize: 10, color: p.isDirect ? "rgba(100,200,100,0.7)" : "rgba(255,255,255,0.3)" }}>
                        {p.isDirect ? "▶ 바로 재생" : "검색 화면으로 이동"}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)" }}>›</span>
                </a>
              ))}
            </div>

            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", marginBottom: 12 }}>
              앱이 설치되어 있고 로그인되어 있으면, 추천 곡이 바로 재생돼요 🎵
            </p>

            <button
              onClick={() => setShowListenSheet(false)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "4px 0" }}
            >
              나중에 듣기
            </button>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
