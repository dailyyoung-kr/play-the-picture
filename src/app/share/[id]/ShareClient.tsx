"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause } from "lucide-react";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { pixelLead } from "@/lib/fpixel";
import { getDeviceId } from "@/lib/supabase";
import { trackEvent } from "@/lib/gtag";
import { captureUtmFromUrl } from "@/lib/utm";

interface ShareEntry {
  id: string;
  song: string;
  artist: string;
  reason: string;
  tags: string[];
  vibe_type: string;
  vibe_description: string;
  // undefined = 사진 아직 로딩 중, [] = 로딩 완료 + 사진 없음, [...] = 로딩 완료 + 사진 있음
  photos?: string[];
  // meta 단계에서만 오는 값 — 실제 사진 개수로 placeholder 자리 확보용
  photo_count?: number;
  album_art?: string | null;
}

export default function ShareClient({ id }: { id: string }) {
  const router = useRouter();

  const [entry, setEntry] = useState<ShareEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const viewLogged = useRef(false);

  // ── iTunes 30초 미리듣기 (result 페이지와 동일 패턴) ──
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "ready" | "playing" | "done">("idle");
  const [previewProgress, setPreviewProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // URL에 utm_* 있으면 sessionStorage에 저장 (이후 analyze_logs에 기록됨)
  useEffect(() => { captureUtmFromUrl(); }, []);

  // 재생 중 rAF로 진행도 갱신 (부드러운 애니메이션)
  useEffect(() => {
    if (previewState !== "playing") return;
    let rafId: number;
    const tick = () => {
      const a = audioRef.current;
      if (a && a.duration) {
        setPreviewProgress(a.currentTime / a.duration);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [previewState]);

  // iTunes 미리듣기 URL 조회 (백그라운드, fire-and-forget)
  useEffect(() => {
    if (!entry?.song || !entry?.artist) return;

    const controller = new AbortController();
    const songName = entry.song;
    const artistName = entry.artist;
    fetch(
      `/api/itunes-preview?title=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((d) => {
        trackEvent("preview_match", {
          song: `${songName} - ${artistName}`,
          matched: !!d.previewUrl,
          match_score: d.score ?? null,
          cache_hit: !!d.cache_hit,
          page: "share",
        });
        if (d.previewUrl) {
          setPreviewUrl(d.previewUrl);
          setPreviewState("ready");
        }
      })
      .catch(() => {});

    // 페이지 떠날 때 재생 중이었다면 elapsed_sec 기록 (result와 동일 패턴)
    return () => {
      controller.abort();
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended && audio.currentTime > 0) {
        trackEvent("preview_abandoned", {
          song: `${songName} - ${artistName}`,
          elapsed_sec: Math.floor(audio.currentTime),
          page: "share",
        });
      }
    };
  }, [entry?.song, entry?.artist]);

  // 미리듣기 재생/일시정지 토글
  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio || !entry) return;
    const songLabel = `${entry.song} - ${entry.artist}`;
    if (previewState === "ready") {
      audio.play().then(() => {
        setPreviewState("playing");
        trackEvent("preview_play", { song: songLabel, page: "share" });
        // 듣기 funnel 측정 — fire-and-forget
        if (isAnalyticsEnabled()) {
          fetch("/api/log-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_id: getDeviceId(),
              song: entry.song,
              artist: entry.artist,
              action: "played",
            }),
          }).catch(() => {});
        }
      }).catch(() => {
        setPreviewState("done");
      });
    } else if (previewState === "playing") {
      audio.pause();
      trackEvent("preview_pause", {
        song: songLabel,
        elapsed_sec: Math.floor(audio.currentTime),
        page: "share",
      });
      setPreviewState("ready");
    }
  };

  // 공유 페이지 방문 기록 — entries fetch와 독립적으로 마운트 즉시 실행
  useEffect(() => {
    if (!id || viewLogged.current || !isAnalyticsEnabled()) return;
    viewLogged.current = true;
    fetch("/api/log-share-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: id, device_id: getDeviceId() }),
    })
      .then(r => r.json())
      .then(d => console.log("[share-view]", d))
      .catch(e => console.error("[share-view] 실패:", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // entries 데이터 2단계 로드:
  //  1단계) meta (사진 제외) — 수 KB, 빠름 → 페이지 즉시 렌더
  //  2단계) photos — 대용량 base64, 백그라운드에서 도착 시 placeholder 자리에 페이드 인
  useEffect(() => {
    if (!id) return;
    fetch(`/api/entries/${id}?fields=meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) setNotFound(true);
        else setEntry({ ...data, photos: undefined } as ShareEntry);
      })
      .catch(() => setNotFound(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !entry || entry.photos !== undefined) return;
    fetch(`/api/entries/${id}?fields=photos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const photos: string[] = Array.isArray(data.photos) ? data.photos : [];
        setEntry((prev) => (prev ? { ...prev, photos } : null));
      })
      .catch(() => {
        // photos fetch 실패 시 — 메타는 이미 떠있음. 빈 배열로 전환하여 album_art fallback 노출
        setEntry((prev) => (prev ? { ...prev, photos: [] } : null));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!entry) return;
      const photos = (entry.photos ?? []).filter(s => s.startsWith("data:"));
      if (e.key === "Escape") setModalIndex(null);
      if (e.key === "ArrowRight") setModalIndex(i => i !== null && photos.length > 1 ? (i + 1) % photos.length : i);
      if (e.key === "ArrowLeft") setModalIndex(i => i !== null && photos.length > 1 ? (i - 1 + photos.length) % photos.length : i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry]);

  const handleTryClick = () => {
    pixelLead({ source: "share_page" });
    // 나도 해보기 클릭 기록 (supabaseAdmin 경유 RLS 우회)
    if (isAnalyticsEnabled()) {
      fetch("/api/log-try-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: id, device_id: getDeviceId() }),
      })
        .then(r => r.json())
        .then(d => console.log("[try-click]", d))
        .catch(e => console.error("[try-click] 실패:", e));
    }
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
            내 사진으로 해보기 <span style={{ fontSize: 17 }}>✦</span>
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

  const photosLoaded = entry.photos !== undefined;
  const modalPhotos = (entry.photos ?? []).filter(s => typeof s === "string" && s.startsWith("data:"));
  const showAlbumArtFallback = photosLoaded && modalPhotos.length === 0 && !!entry.album_art;
  // 로딩 중엔 placeholder 노출, 로딩 완료 후에만 실제 콘텐츠/앨범아트 표시
  const showPhotoSection = !photosLoaded || modalPhotos.length > 0 || showAlbumArtFallback;

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

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

        {/* 상단 앱 이름 + 서브 문구 — result 페이지와 동일 패턴 */}
        <div className="text-center" style={{ paddingTop: 20, paddingBottom: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300, marginBottom: 4 }}>
            Play the Picture
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", margin: 0 }}>
            플더픽의 추천곡
          </p>
        </div>

        <div className="flex-1 flex flex-col px-5 overflow-y-auto" style={{ paddingTop: 16, paddingBottom: 90 }}>
          {showPhotoSection && (() => {
            // 로딩 중엔 photo_count 기준, 로딩 완료 후엔 modalPhotos 개수 기준
            const count = photosLoaded ? (modalPhotos.length || 1) : (entry.photo_count || 1);
            const slotSize = count === 1 ? 100 : count === 2 ? 88 : count === 3 ? 80 : count === 4 ? 72 : 64;
            return (
              <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "nowrap", marginBottom: 12 }}>
                {!photosLoaded ? (
                  // 사진 로딩 중 — photo_count 만큼 동일 크기 placeholder 노출 → 레이아웃 shift 방지
                  Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={{ width: slotSize, height: slotSize, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
                  ))
                ) : modalPhotos.length > 0 ? modalPhotos.map((src, i) => (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => setModalIndex(i)}
                    onTouchEnd={(e) => { e.preventDefault(); setModalIndex(i); }}
                    style={{ width: slotSize, height: slotSize, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, overflow: "hidden", cursor: "pointer", animation: "fadeIn 0.3s ease" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", display: "block" }} />
                  </div>
                )) : (
                  <div style={{ width: 100, height: 100, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.album_art!} alt="앨범아트" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* 오늘의 당신은 */}
          {entry.vibe_type && (
            <div style={{ width: "100%", marginBottom: 12, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginBottom: 5 }}>오늘의 당신은</p>
              <p className="font-medium" style={{ fontSize: 16, color: "#fff", marginBottom: 5, lineHeight: 1.35 }}>
                {entry.vibe_type}
              </p>
              {entry.vibe_description && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                  {entry.vibe_description}
                </p>
              )}
            </div>
          )}

          <div className="text-center mb-4">
            <h1 className="font-semibold mb-1" style={{ fontSize: 28, color: "#fff", letterSpacing: "-0.5px" }}>{entry.song}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>{entry.artist}</p>
          </div>

          {/* iTunes 30초 미리듣기 — result 페이지와 동일 디자인 */}
          {previewUrl && (
            <audio
              ref={audioRef}
              src={previewUrl}
              preload="none"
              onEnded={() => {
                trackEvent("preview_complete", {
                  song: `${entry.song} - ${entry.artist}`,
                  page: "share",
                });
                // 듣기 funnel 측정 — 30초 완료
                if (isAnalyticsEnabled()) {
                  fetch("/api/log-preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      device_id: getDeviceId(),
                      song: entry.song,
                      artist: entry.artist,
                      action: "completed",
                    }),
                  }).catch(() => {});
                }
                setPreviewState("ready");
                setPreviewProgress(0);
              }}
            />
          )}
          {(previewState === "ready" || previewState === "playing") && (() => {
            const PREVIEW_DURATION = 30;
            const elapsed = Math.floor(previewProgress * PREVIEW_DURATION);
            const fmt = (s: number) => `0:${String(Math.max(0, s)).padStart(2, "0")}`;
            return (
              <div
                role="button"
                onClick={togglePreview}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px",
                  marginTop: 12,
                  background: "linear-gradient(180deg, rgba(196,104,122,0.16) 0%, rgba(196,104,122,0.06) 100%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 24,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.12)",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", flexShrink: 0,
                }}>
                  {previewState === "ready"
                    ? <Play size={14} fill="#fff" strokeWidth={0} style={{ marginLeft: 1 }} />
                    : <Pause size={14} fill="#fff" strokeWidth={0} />}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{
                    fontSize: 9, color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.02em", lineHeight: 1,
                    textAlign: "center",
                  }}>
                    30초 들어보기
                  </div>
                  <div style={{ position: "relative", height: 14, display: "flex", alignItems: "center" }}>
                    <div style={{
                      position: "absolute", left: 0, right: 0, top: "50%",
                      transform: "translateY(-50%)",
                      height: 3, borderRadius: 2,
                      background: "rgba(255,255,255,0.15)",
                    }} />
                    <div style={{
                      position: "absolute", left: 0, top: "50%",
                      transform: "translateY(-50%)",
                      width: `${previewProgress * 100}%`,
                      height: 3, borderRadius: 2,
                      background: "#C4687A",
                    }} />
                    <div style={{
                      position: "absolute", top: "50%",
                      left: `${previewProgress * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width: 10, height: 10, borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }} />
                  </div>
                </div>
                <div style={{
                  fontSize: 11, color: "rgba(255,255,255,0.6)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 56, textAlign: "right", flexShrink: 0,
                }}>
                  {fmt(elapsed)} / 0:30
                </div>
              </div>
            );
          })()}

          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginTop: 12, marginBottom: 20 }}>
            <p className="font-medium mb-2" style={{ fontSize: 10, color: "#f0d080", letterSpacing: "0.05em" }}>플더픽이 추천한 이유</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{entry.reason}</p>
          </div>
        </div>

        {/* Fixed bottom CTA — 항상 뷰포트 하단에 고정 */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            padding: "14px 20px calc(12px + env(safe-area-inset-bottom))",
            background: "linear-gradient(to bottom, rgba(13,18,24,0) 0%, rgba(13,18,24,0.25) 40%, rgba(13,18,24,0.5) 100%)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <button
            className="w-full font-medium"
            onClick={handleTryClick}
            style={{ background: "#C4687A", border: "none", borderRadius: 24, padding: 14, color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            내 사진으로 해보기 <span style={{ fontSize: 17 }}>✦</span>
          </button>
        </div>
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
