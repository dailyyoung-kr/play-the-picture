"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { pixelLead } from "@/lib/fpixel";

interface ShareEntry {
  id: string;
  song: string;
  artist: string;
  reason: string;
  tags: string[];
  vibe_spectrum?: { energy: number; warmth: number; social: number; special: number } | null;
  vibe_type: string;
  vibe_description: string;
  photos: string[];
  album_art?: string | null;
}

const VIBE_SPECTRUM_AXES = [
  { key: "energy" as const, left: "차분함", right: "에너제틱" },
  { key: "warmth" as const, left: "쿨함",   right: "따뜻함" },
  { key: "social" as const, left: "혼자",   right: "함께" },
  { key: "special" as const, left: "일상적", right: "특별함" },
];

export default function ShareClient({ id }: { id: string }) {
  const router = useRouter();

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
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const viewLogged = useRef(false);

  // 공유 페이지 방문 기록 — entries fetch와 독립적으로 마운트 즉시 실행
  useEffect(() => {
    if (!id || viewLogged.current) return;
    viewLogged.current = true;
    fetch("/api/log-share-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: id }),
    })
      .then(r => r.json())
      .then(d => console.log("[share-view]", d))
      .catch(e => console.error("[share-view] 실패:", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // entries 데이터 로드
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!entry) return;
      const photos = entry.photos.filter(s => s.startsWith("data:"));
      if (e.key === "Escape") setModalIndex(null);
      if (e.key === "ArrowRight") setModalIndex(i => i !== null && photos.length > 1 ? (i + 1) % photos.length : i);
      if (e.key === "ArrowLeft") setModalIndex(i => i !== null && photos.length > 1 ? (i - 1 + photos.length) % photos.length : i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry]);

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

  const handleTryClick = () => {
    pixelLead({ source: "share_page" });
    // 나도 해보기 클릭 기록 (supabaseAdmin 경유 RLS 우회)
    fetch("/api/log-try-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: id }),
    })
      .then(r => r.json())
      .then(d => console.log("[try-click]", d))
      .catch(e => console.error("[try-click] 실패:", e));
    router.push("/");
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
            onClick={handleTryClick}
            style={{ background: "#C4687A", border: "none", borderRadius: 24, padding: "12px 32px", color: "#fff", fontSize: 14, cursor: "pointer" }}
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

  const modalPhotos = entry.photos.filter(s => typeof s === "string" && s.startsWith("data:"));
  const showAlbumArtFallback = modalPhotos.length === 0 && !!entry.album_art;
  const showPhotoSection = modalPhotos.length > 0 || showAlbumArtFallback;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.album_art} alt="" aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.55)", transform: "scale(1.5)", pointerEvents: "none" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.album_art} alt="" aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center 25%", filter: "blur(6px) brightness(0.9)", pointerEvents: "none" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.75) 100%)" }} />
        </>
      )}

      <div className="min-h-screen flex flex-col" style={{ position: "relative", zIndex: 1, background: entry.album_art ? "transparent" : "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}>

        <div className="text-center pt-12 pb-3" style={{ fontSize: 15, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300 }}>
          Play the Picture
        </div>

        <div className="flex-1 flex flex-col px-5 overflow-y-auto">
          <p className="text-center mb-3" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
            친구의 오늘
          </p>

          {showPhotoSection && (
            <div className="flex gap-2 justify-center mb-5">
              {modalPhotos.length > 0 ? modalPhotos.map((src, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setModalIndex(i)}
                  onTouchEnd={(e) => { e.preventDefault(); setModalIndex(i); }}
                  style={{ width: 100, height: 124, borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.13)", flexShrink: 0, overflow: "hidden", cursor: "pointer" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                </div>
              )) : (
                <div style={{ width: 100, height: 124, borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.13)", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.album_art!} alt="앨범아트" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
            </div>
          )}

          <div className="text-center mb-4">
            <h1 className="font-semibold mb-1" style={{ fontSize: 28, color: "#fff", letterSpacing: "-0.5px" }}>{entry.song}</h1>
            <p className="mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>{entry.artist}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {entry.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.78)" }}>
                  #{tag.replace(/^#+/, "")}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12 }}>
            <p className="mb-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>✦ 사진 분위기</p>

            {entry.vibe_spectrum ? (
              <div style={{ marginBottom: entry.vibe_type ? 12 : 0 }}>
                {VIBE_SPECTRUM_AXES.map(({ key, left, right }) => {
                  const val = entry.vibe_spectrum![key];
                  return (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{left}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{right}</span>
                      </div>
                      <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                        <div style={{
                          position: "absolute",
                          left: `calc(${val}% - 7px)`,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: "#C4687A",
                          boxShadow: "0 0 6px rgba(196,104,122,0.6)",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {entry.vibe_type && (
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>사진으로 분석한 내 음악 스타일</p>
                <p className="font-medium" style={{ fontSize: 15, color: "#a0f0b0", marginBottom: 4 }}>{entry.vibe_type}</p>
                {entry.vibe_description && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>{entry.vibe_description}</p>}
              </div>
            )}
          </div>

          <div className="mb-5" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
            <p className="font-medium mb-2" style={{ fontSize: 10, color: "#f0d080", letterSpacing: "0.05em" }}>플더픽이 추천한 이유</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{entry.reason}</p>
          </div>
        </div>

        <div className="px-5">
          <button className="w-full font-medium mb-2" onClick={handleListenClick}
            style={{ background: "#fff", border: "none", borderRadius: 24, padding: 14, color: "#0d1218", fontSize: 14, cursor: "pointer" }}>
            ▶  지금 바로 듣기
          </button>
          <button className="w-full font-medium mb-5" onClick={handleTryClick}
            style={{ background: "#C4687A", border: "none", borderRadius: 24, padding: 14, color: "#fff", fontSize: 14, cursor: "pointer" }}>
            나도 해보기 ✦
          </button>
        </div>

        {showListenSheet && (
          <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} onClick={() => setShowListenSheet(false)} />
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(13,18,24,0.98)", borderRadius: "20px 20px 0 0", padding: "12px 20px 40px", zIndex: 61, border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, margin: "0 auto 20px" }} />
              <p className="font-medium text-center" style={{ fontSize: 16, color: "#fff", marginBottom: 10 }}>어디서 들을까?</p>
              <div className="flex justify-center mb-5">
                <span style={{ background: "rgba(196,104,122,0.18)", border: "1px solid rgba(196,104,122,0.4)", color: "#C4687A", fontSize: 12, padding: "4px 14px", borderRadius: 20 }}>
                  {songForShare}{artistForShare ? ` — ${artistForShare}` : ""}
                </span>
              </div>
              {loadingLinks && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 12 }}>🎵 링크 찾는 중...</div>}
              <div className="flex flex-col" style={{ gap: 8, marginBottom: 12 }}>
                {platforms.map((p) => (
                  <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 14, height: 60, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "0 16px", textDecoration: "none", opacity: loadingLinks ? 0.5 : 1 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {p.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, color: "#fff", display: "block" }}>{p.name}</span>
                      {!loadingLinks && <span style={{ fontSize: 10, color: p.isDirect ? "rgba(100,200,100,0.7)" : "rgba(255,255,255,0.3)" }}>{p.isDirect ? "▶ 바로 재생" : "검색 화면으로 이동"}</span>}
                    </div>
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)" }}>›</span>
                  </a>
                ))}
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🎵</span>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
                  앱이 설치·로그인되어 있으면<br />추천 곡이 바로 재생돼요
                </p>
              </div>
              <button onClick={() => setShowListenSheet(false)}
                style={{
                  width: "100%", cursor: "pointer",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 24, padding: "12px 0",
                  fontSize: 14, color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                }}>
                나중에 듣기
              </button>
            </div>
          </>
        )}
      </div>

      {/* 사진 확대 모달 */}
      {modalIndex !== null && modalPhotos[modalIndex] && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.2s ease" }}
          onClick={() => setModalIndex(null)}
        >
          <button
            onClick={() => setModalIndex(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: 20, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 201 }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={modalPhotos[modalIndex]}
            alt={`사진 ${modalIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, userSelect: "none" }}
          />
          {modalPhotos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setModalIndex(i => i !== null ? (i - 1 + modalPhotos.length) % modalPhotos.length : 0); }}
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 22, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ‹
            </button>
          )}
          {modalPhotos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setModalIndex(i => i !== null ? (i + 1) % modalPhotos.length : 0); }}
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 22, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ›
            </button>
          )}
          {modalPhotos.length > 1 && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "5px 16px", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
              {modalIndex + 1} / {modalPhotos.length}
            </div>
          )}
          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </div>
      )}
    </div>
  );
}
