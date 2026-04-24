"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { pixelLead } from "@/lib/fpixel";
import { getDeviceId } from "@/lib/supabase";
import { captureUtmFromUrl } from "@/lib/utm";

interface ShareEntry {
  id: string;
  song: string;
  artist: string;
  reason: string;
  tags: string[];
  vibe_type: string;
  vibe_description: string;
  photos: string[];
  album_art?: string | null;
}

export default function ShareClient({ id }: { id: string }) {
  const router = useRouter();

  const [entry, setEntry] = useState<ShareEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const viewLogged = useRef(false);

  // URL에 utm_* 있으면 sessionStorage에 저장 (이후 analyze_logs에 기록됨)
  useEffect(() => { captureUtmFromUrl(); }, []);

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

  // entries 데이터 로드 — supabaseAdmin 경유 서버 API 사용 (RLS 우회)
  useEffect(() => {
    if (!id) return;
    fetch(`/api/entries/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) setNotFound(true);
        else setEntry(data as ShareEntry);
      })
      .catch(() => setNotFound(true));
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
            나도 해보기
          </button>
        </div>
      </div>
    );
  }

  if (!entry) {
    // 스켈레톤 로딩 — 실제 레이아웃과 동일한 구조로 placeholder 표시
    const skel = "rgba(255,255,255,0.06)";
    const skelBox = (w: number | string, h: number, mb = 0, extra: React.CSSProperties = {}) => (
      <div style={{ width: w, height: h, borderRadius: 8, background: skel, marginBottom: mb, ...extra }} />
    );
    return (
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}>
        <div className="min-h-screen flex flex-col" style={{ position: "relative", zIndex: 1 }}>
          <div className="text-center pt-12 pb-3" style={{ fontSize: 15, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300 }}>
            Play the Picture
          </div>
          <div className="flex-1 flex flex-col px-5 overflow-y-auto" style={{ paddingBottom: 90 }}>
            <p className="text-center mb-3" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
              플더픽의 추천곡
            </p>
            {/* 사진 placeholder */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 100, height: 100, borderRadius: 14, background: skel, border: "1px solid rgba(255,255,255,0.08)" }} />
            </div>
            {/* 바이브 박스 placeholder */}
            <div style={{ width: "100%", marginBottom: 12, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {skelBox(60, 10)}
              {skelBox(140, 18)}
              {skelBox(180, 12)}
            </div>
            {/* 곡명 + 아티스트 + 태그 placeholder */}
            <div className="text-center mb-4" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {skelBox(240, 26)}
              {skelBox(100, 13)}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {skelBox(50, 22, 0, { borderRadius: 20 })}
                {skelBox(60, 22, 0, { borderRadius: 20 })}
                {skelBox(50, 22, 0, { borderRadius: 20 })}
              </div>
            </div>
            {/* 추천 이유 박스 placeholder */}
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginTop: 12, marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {skelBox(100, 10, 4)}
              {skelBox("100%", 12)}
              {skelBox("95%", 12)}
              {skelBox("80%", 12)}
            </div>
          </div>
          {/* CTA는 실제 버튼 그대로 노출 — 로딩 중에도 클릭 가능 */}
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
              나도 해보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const modalPhotos = entry.photos.filter(s => typeof s === "string" && s.startsWith("data:"));
  const showAlbumArtFallback = modalPhotos.length === 0 && !!entry.album_art;
  const showPhotoSection = modalPhotos.length > 0 || showAlbumArtFallback;

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

        <div className="flex-1 flex flex-col px-5 overflow-y-auto" style={{ paddingBottom: 90 }}>
          <p className="text-center mb-3" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
            플더픽의 추천곡
          </p>

          {showPhotoSection && (() => {
            const count = modalPhotos.length || 1;
            const slotSize = count === 1 ? 100 : count === 2 ? 88 : count === 3 ? 80 : count === 4 ? 72 : 64;
            return (
              <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "nowrap", marginBottom: 12 }}>
                {modalPhotos.length > 0 ? modalPhotos.map((src, i) => (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => setModalIndex(i)}
                    onTouchEnd={(e) => { e.preventDefault(); setModalIndex(i); }}
                    style={{ width: slotSize, height: slotSize, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, overflow: "hidden", cursor: "pointer" }}
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
            <p className="mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>{entry.artist}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {entry.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.78)" }}>
                  #{tag.replace(/^#+/, "")}
                </span>
              ))}
            </div>
          </div>

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
            나도 해보기
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
