"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseWithDeviceId } from "@/lib/supabase";
import { Archive, Music } from "lucide-react";
import { getDeviceId } from "@/lib/device";
import { trackEvent } from "@/lib/gtag";
import { pixelViewContent, pixelLead } from "@/lib/fpixel";
import { isAnalyticsEnabled } from "@/lib/analytics";

interface AnalysisResult {
  song: string; // "곡명 - 아티스트명" 형식
  reason: string;
  tags: string[];
  vibeType?: string;
  vibeDescription?: string;
  hiddenEmotion?: string;
  emotionComment?: string;
  // snake_case — localStorage에 저장된 구버전 결과 호환용
  emotions?: Record<string, number>;
  hidden_emotion?: string;
  emotion_comment?: string;
  vibe_type?: string;
  vibe_description?: string;
  spotifyTrackId?: string | null;
  albumArt?: string | null;
  isGenreDiscovery?: boolean;
  discoveredGenre?: string | null;
}

const PHOTO_COLORS = [
  "linear-gradient(160deg, #1a2a1a, #0a1a0a)",
  "linear-gradient(160deg, #2a2a3a, #1a1a2a)",
  "linear-gradient(160deg, #003850, #001830)",
];

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // save_logs 기록 완료 여부 (UI 잠금용)
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [toast, setToast] = useState<React.ReactNode>("");
  const [toastOnClick, setToastOnClick] = useState<(() => void) | null>(null);
  const [showListenSheet, setShowListenSheet] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [musicLinks, setMusicLinks] = useState<{
    spotifyUrl: string | null;
    youtubeUrl: string | null;
    spotifyFallback: string;
    youtubeFallback: string;
  } | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── 체류 시간 트래킹 ──
  const enterTimeRef   = useRef<number>(Date.now());
  const hasLoggedRef   = useRef<boolean>(false);
  const savedEntryIdRef = useRef<string | null>(null); // savedEntryId의 최신값을 ref로 미러링

  // logViewDuration을 ref로 저장해서 handleListenClick에서도 접근 가능하게
  const logViewDurationRef = useRef<(exitType: string) => void>(() => {});
  logViewDurationRef.current = (exitType: string) => {
    if (!isAnalyticsEnabled()) return;
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    const duration = Math.floor((Date.now() - enterTimeRef.current) / 1000);
    const deviceId = getDeviceId();
    const data = JSON.stringify({
      entry_id: savedEntryIdRef.current ?? null,
      duration_seconds: duration,
      exit_type: exitType,
    });
    const blob = new Blob([data], { type: "application/json" });
    navigator.sendBeacon(
      `/api/log-result-view?device_id=${encodeURIComponent(deviceId)}`,
      blob
    );
  };

  const showToast = (msg: React.ReactNode, onClick?: () => void) => {
    setToast(msg);
    setToastOnClick(() => onClick ?? null);
    setTimeout(() => { setToast(""); setToastOnClick(null); }, 3000);
  };

  // 저장 후 id 반환 (이미 저장돼 있으면 캐시된 id 반환)
  const saveEntry = async (): Promise<string | null> => {
    if (savedEntryId) return savedEntryId;
    if (!result) return null;

    const songParts = result.song.split(" - ");
    const song = songParts[0] ?? result.song;
    const artist = songParts.slice(1).join(" - ") ?? "";
    const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const today = kst.replace(/\.\s*/g, '-').replace(/-$/, '').trim();

    const prefsRaw = localStorage.getItem("ptp_prefs");
    const prefs: { genre?: string; mood?: string } = prefsRaw ? JSON.parse(prefsRaw) : {};

    const { data, error } = await getSupabaseWithDeviceId()
      .from("entries")
      .insert({
        date: today,
        song,
        artist,
        reason: result.reason,
        tags: result.tags,
        emotions: result.emotions ?? {},
        vibe_spectrum: null,
        vibe_type: result.vibeType ?? result.vibe_type ?? "",
        vibe_description: result.vibeDescription ?? result.vibe_description ?? "",
        photos,
        album_art: result.albumArt ?? null,
        device_id: getDeviceId(),
        genre: prefs.genre ?? null,
        mood: prefs.mood ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;
    setSavedEntryId(data.id);
    return data.id;
  };

  const handleSaveToSupabase = async () => {
    if (!result || isSaved) return;
    trackEvent("save_click", { song: result.song });
    setSaving(true);
    try {
      // 1) entries 저장 (이미 공유로 생성됐으면 재사용)
      const entryId = await saveEntry();
      if (!entryId) throw new Error("저장 실패");

      // 2) save_logs에 기록 — 이게 "실제 저장 의도" 표시
      const saveRes = await fetch("/api/log-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: entryId, device_id: getDeviceId() }),
      });
      if (!saveRes.ok) throw new Error("save_logs 기록 실패");

      setIsSaved(true);
      showToast(
        <span>✦ 오늘의 기록이 저장됐어요 · <span style={{ color: "#C4687A" }}>모아보기 →</span></span>,
        () => router.push("/journal")
      );
    } catch (e) {
      console.error("저장 오류:", e);
      showToast("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    trackEvent("share_click", { song: result.song });
    pixelLead();
    setSharing(true);
    try {
      const entryId = await saveEntry();
      if (!entryId) throw new Error("저장 실패");

      // 공유 로그 기록 (에러 나도 공유 흐름은 계속)
      if (isAnalyticsEnabled()) {
        fetch("/api/log-share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry_id: entryId, device_id: getDeviceId() }),
        }).catch(() => {});
      }

      const url = `https://play-the-picture.vercel.app/share/${entryId}`;
      const songName = result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song;
      const artistName = result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : "";

      // 1) Web Share API 시도
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${songName}${artistName ? ` — ${artistName}` : ""}`,
            text: "나의 오늘은 어떤 곡일까? ✦",
            url,
          });
          return; // 성공 시 종료
        } catch (shareErr) {
          const msg = shareErr instanceof Error ? shareErr.message : "";
          if (msg.includes("abort") || msg === "AbortError") return; // 사용자가 취소
          // share 실패 → 클립보드로 fallback
        }
      }

      // 2) 클립보드 복사 시도
      try {
        await navigator.clipboard.writeText(url);
        showToast("링크 복사됐어요! 카카오톡에 붙여넣기해서 공유하세요 ✦");
      } catch {
        // 3) 클립보드도 안 되면 URL 직접 보여주기
        setShareUrl(url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "AbortError" && !msg.includes("abort")) {
        showToast("공유에 실패했어요. 다시 시도해주세요.");
      }
    } finally {
      setSharing(false);
    }
  };


  const handleSave = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0d1218",
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
        foreignObjectRendering: false,
        imageTimeout: 15000,
        onclone: (clonedDoc: Document) => {
          const el = clonedDoc.querySelector("#result-card") as HTMLElement;
          if (el) el.style.background = "linear-gradient(158deg, #0d1a10 0%, #1a0d18 100%)";
        },
      });

      const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const today = kst.replace(/\.\s*/g, '-').replace(/-$/, '').trim();
      const fileName = `play-the-picture-${today}.png`;

      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const dataUrl = canvas.toDataURL("image/png");
        const newTab = window.open();
        if (newTab) {
          newTab.document.write(`<img src="${dataUrl}" style="max-width:100%" />`);
          newTab.document.title = fileName;
        }
      } else {
        const link = document.createElement("a");
        link.download = fileName;
        link.href = canvas.toDataURL("image/png");
        link.click();
      }
    } catch (e) {
      console.error("저장 오류:", e);
    } finally {
      setSaving(false);
    }
  };

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
    if (isAnalyticsEnabled()) {
      trackEvent("listen_click", { song: result?.song });
      fetch("/api/log-listen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": getDeviceId(),
        },
        body: JSON.stringify({
          entry_id: savedEntryId ?? null,
          song: result?.song ?? null,
        }),
      }).catch(() => {});
      // 듣기 클릭 시 체류 시간 기록 (exit_type: listen_click)
      logViewDurationRef.current("listen_click");
    }
    setShowListenSheet(true);
    // DB 먼저 조회 → youtube_video_id 포함한 딥링크 획득 (spotifyTrackId 유무 무관)
    if (!musicLinks && result) {
      const songName = result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song;
      const artistName = result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : "";
      fetchMusicLinks(songName, artistName);
    }
  };

  // savedEntryId가 바뀔 때마다 ref 동기화
  useEffect(() => { savedEntryIdRef.current = savedEntryId; }, [savedEntryId]);

  // 체류 시간 트래킹: 마운트 시 시작, 언마운트/언로드 시 전송
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    enterTimeRef.current = Date.now();
    hasLoggedRef.current = false;
    const handleBeforeUnload = () => logViewDurationRef.current("unload");
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      logViewDurationRef.current("navigate");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalIndex(null);
      if (e.key === "ArrowRight") setModalIndex((i) => (i !== null && photos.length > 1 ? (i + 1) % photos.length : i));
      if (e.key === "ArrowLeft") setModalIndex((i) => (i !== null && photos.length > 1 ? (i - 1 + photos.length) % photos.length : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length]);

  useEffect(() => {
    const raw = localStorage.getItem("ptp_result");
    const photosRaw = localStorage.getItem("ptp_photos");
    if (raw) {
      const parsed: AnalysisResult = JSON.parse(raw);
      setResult(parsed);
      trackEvent("result_view", { song: parsed.song });
      pixelViewContent(parsed.song);
    }
    if (photosRaw) setPhotos(JSON.parse(photosRaw));
  }, []);

  if (!result) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
      >
        <div className="text-center">
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>결과를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const bgGradient = "linear-gradient(158deg, #0d1a10 0%, #1a0d18 100%)";

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>

      {/* 앨범아트 배경 */}
      {result.albumArt && (
        <>
          {/* 레이어 1: 화면 채우기용 강블러 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.albumArt}
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(40px) brightness(0.55)",
              transform: "scale(1.5)",
              pointerEvents: "none",
            }}
          />
          {/* 레이어 2: 전체 앨범아트 표시 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.albumArt}
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "contain",
              objectPosition: "center 25%",
              filter: "blur(6px) brightness(0.9)",
              pointerEvents: "none",
            }}
          />
          {/* 그라디언트 오버레이 */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.75) 100%)",
          }} />
        </>
      )}

    <div
      className="min-h-screen flex flex-col"
      style={{ position: "relative", zIndex: 1, background: result.albumArt ? "transparent" : bgGradient }}
    >
      {/* 캡처 영역 시작 */}
      <div ref={cardRef} id="result-card">

      {/* 상단 앱 이름 + 서브 문구 */}
      <div className="text-center" style={{ paddingTop: 20, paddingBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300, marginBottom: 4 }}>
          Play the Picture
        </div>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", margin: 0 }}>
          플더픽의 추천곡
        </p>
      </div>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto" style={{ paddingTop: 16 }}>

        {/* ── 섹션 1: 사진 + 오늘의 당신은 (세로 배치 통일) ── */}
        {(() => {
          const count = photos.length;
          const slotSize = count === 1 ? 100 : count === 2 ? 88 : count === 3 ? 80 : count === 4 ? 72 : 64;
          const gap = count <= 3 ? 6 : 5;
          const displayItems = count > 0 ? photos : PHOTO_COLORS;

          return (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
              {/* 사진 행: 가운데 정렬 */}
              <div style={{ display: "flex", gap, justifyContent: "center", flexWrap: "wrap", alignContent: "flex-start" }}>
                {displayItems.map((src, i) => {
                  const isPhoto = typeof src === "string" && src.startsWith("data:");
                  return (
                    <div
                      key={i}
                      role={isPhoto ? "button" : undefined}
                      tabIndex={isPhoto ? 0 : undefined}
                      onClick={() => isPhoto && setModalIndex(i)}
                      onTouchEnd={(e) => { if (isPhoto) { e.preventDefault(); setModalIndex(i); } }}
                      style={{
                        width: slotSize, height: slotSize,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.12)",
                        flexShrink: 0, overflow: "hidden",
                        background: isPhoto ? undefined : PHOTO_COLORS[i % PHOTO_COLORS.length],
                        cursor: isPhoto ? "pointer" : "default",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {isPhoto && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={`사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", pointerEvents: "none", display: "block" }} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 캐릭터 섹션: 가운데 정렬 */}
              <div style={{
                width: "100%", marginTop: 12,
                background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px",
                display: "flex", flexDirection: "column", justifyContent: "center",
                textAlign: "center",
              }}>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginBottom: 5 }}>오늘의 당신은</p>
                <p className="font-medium" style={{ fontSize: 16, color: "#fff", marginBottom: 5, lineHeight: 1.35 }}>
                  {result.vibeType ?? result.vibe_type}
                </p>
                {(result.vibeDescription ?? result.vibe_description) && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                    {result.vibeDescription ?? result.vibe_description}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 섹션 3: 곡 정보 ── */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 10 }}>
          {result.isGenreDiscovery && (
            <div className="flex justify-center" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#C4687A", border: "1px solid #C4687A", padding: "3px 10px", borderRadius: 20 }}>
                오늘의 새로운 발견 🔭
              </span>
            </div>
          )}
          <h1 className="font-semibold" style={{ fontSize: 26, color: "#fff", letterSpacing: "-0.5px", textAlign: "center", marginBottom: 4 }}>
            {result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.48)", textAlign: "center", marginBottom: 8 }}>
            {result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : ""}
          </p>
          <div className="flex gap-2 justify-center flex-wrap" style={{ marginBottom: 6 }}>
            {result.tags.map((tag) => (
              <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.78)" }}>
                #{tag.replace(/^#+/, "")}
              </span>
            ))}
          </div>
          {result.isGenreDiscovery && result.discoveredGenre && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 6 }}>
              당신이 좋아할 것 같은 장르 : {result.discoveredGenre}
            </p>
          )}
        </div>

        {/* ── 섹션 4: 추천 이유 ── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
          <p className="font-medium" style={{ fontSize: 10, color: "#f0d080", letterSpacing: "0.05em", marginBottom: 6 }}>
            플더픽이 추천한 이유
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
            {result.reason}
          </p>
        </div>

      </div>
      </div>
      {/* 캡처 영역 끝 */}

      <div className="px-5 pb-2">

        {/* Primary: 지금 바로 듣기 */}
        <button
          className="w-full font-medium"
          onClick={handleListenClick}
          style={{
            background: "#C4687A",
            border: "none",
            borderRadius: 24, padding: 14,
            color: "#fff",
            fontSize: 14, cursor: "pointer",
            marginBottom: 8,
          }}
        >
          ▶ 지금 바로 듣기
        </button>

        {/* Secondary: 저장 + 공유 나란히 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={handleSaveToSupabase}
            disabled={saving || isSaved}
            style={{
              flex: 1,
              background: isSaved ? "rgba(196,104,122,0.15)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${isSaved ? "rgba(196,104,122,0.4)" : "rgba(255,255,255,0.2)"}`,
              borderRadius: 24, padding: 13,
              color: isSaved ? "#C4687A" : (saving ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)"),
              fontSize: 13, cursor: (saving || isSaved) ? "default" : "pointer",
            }}
          >
            {isSaved ? "✓ 보관됨" : (saving ? "저장 중..." : "💾 보관하기")}
          </button>
          <button
            className="font-medium"
            onClick={handleShare}
            disabled={sharing}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 24, padding: 13,
              color: sharing ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
              fontSize: 13, cursor: sharing ? "default" : "pointer",
            }}
          >
            {sharing ? "공유 중..." : "📷 결과 공유하기"}
          </button>
        </div>

        {/* 다시 해보기 — 텍스트 링크 */}
        <button
          className="w-full"
          onClick={() => {
            localStorage.removeItem("ptp_photos");
            localStorage.removeItem("ptp_result");
            router.push("/");
          }}
          style={{
            background: "none",
            border: "none",
            color: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 0",
            textAlign: "center",
          }}
        >
          한 번 더 해보기
        </button>

      </div>

      {/* 듣기 바텀시트 */}
      {showListenSheet && result && (() => {
        const songName = result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song;
        const artistName = result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : "";

        const platforms = [
          {
            name: "YouTube Music에서 듣기",
            url: musicLinks?.youtubeUrl ?? musicLinks?.youtubeFallback ?? `https://music.youtube.com/search?q=${encodeURIComponent(`${songName} ${artistName}`)}`,
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
            url: result.spotifyTrackId
              ? `https://open.spotify.com/track/${result.spotifyTrackId}`
              : (musicLinks?.spotifyUrl ?? musicLinks?.spotifyFallback ?? `https://open.spotify.com/search/${encodeURIComponent(`${songName} ${artistName}`)}`),
            isDirect: !!(result.spotifyTrackId || musicLinks?.spotifyUrl),
            iconBg: "#1DB954",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.713 1.115a.623.623 0 01.206.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.973c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.532-1.072 9.404-.865 13.115 1.338a.937.937 0 01-.955 1.613z"/>
              </svg>
            ),
          },
        ];

        return (
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
                어디서 들을까요?
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
                  {songName}{artistName ? ` — ${artistName}` : ""}
                </span>
              </div>

              {loadingLinks && !result.spotifyTrackId && (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 12 }}>
                  🎵 링크 찾는 중...
                </div>
              )}

              <div className="flex flex-col" style={{ gap: 8, marginBottom: 20 }}>
                {platforms.map((p) => (
                  <a
                    key={p.name}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent(p.name.includes("Spotify") ? "spotify_click" : "youtube_click", { song: songName })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      height: 60,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "0 16px",
                      textDecoration: "none",
                      opacity: (loadingLinks && !result.spotifyTrackId) ? 0.5 : 1,
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
                      {(!loadingLinks || result.spotifyTrackId) && (
                        <span style={{ fontSize: 10, color: p.isDirect ? "rgba(100,200,100,0.7)" : "rgba(255,255,255,0.3)" }}>
                          {p.isDirect ? "▶ 바로 재생" : "검색 화면으로 이동"}
                        </span>
                      )}
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

              <button
                onClick={() => setShowListenSheet(false)}
                style={{
                  width: "100%", cursor: "pointer",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 24, padding: "12px 0",
                  fontSize: 14, color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                }}
              >
                나중에 듣기
              </button>
            </div>
          </>
        );
      })()}

      {/* URL 직접 보여주기 모달 (클립보드 fallback 실패 시) */}
      {shareUrl && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 90,
          display: "flex", alignItems: "flex-end",
        }} onClick={() => setShareUrl(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: "#1a1f2b",
              borderRadius: "20px 20px 0 0",
              padding: "20px 20px 40px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, margin: "0 auto 20px" }} />
            <p style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 6 }}>공유 링크</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              아래 링크를 길게 눌러 복사한 뒤 카카오톡에 보내세요
            </p>
            <div style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              wordBreak: "break-all",
              lineHeight: 1.6,
              marginBottom: 16,
              userSelect: "all",
            }}>
              {shareUrl}
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  showToast("링크 복사됐어요! 카카오톡에 붙여넣기해서 공유하세요 ✦");
                  setShareUrl(null);
                } catch {
                  showToast("위 링크를 길게 눌러 복사하세요");
                }
              }}
              style={{
                width: "100%", background: "#C4687A", border: "none",
                borderRadius: 24, padding: 14, color: "#fff", fontSize: 14, cursor: "pointer",
              }}
            >
              링크 복사하기
            </button>
          </div>
        </div>
      )}

      {/* 토스트 메시지 */}
      {toast && (
        <div
          onClick={toastOnClick ?? undefined}
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(30,30,30,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 13,
            padding: "10px 20px",
            borderRadius: 24,
            zIndex: 100,
            whiteSpace: "nowrap",
            cursor: toastOnClick ? "pointer" : "default",
          }}
        >
          {toast}
        </div>
      )}

      {/* 하단 네비게이션 */}
      <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px", flexShrink: 0 }}>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", cursor: "pointer" }} onClick={() => router.push("/journal")}>
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#fff", cursor: "pointer" }} onClick={() => router.push("/")}>
          <Music size={22} strokeWidth={1.5} />
          노래 추천받기
        </div>
      </div>
    </div>

    {/* 사진 확대 모달 */}
    {modalIndex !== null && photos[modalIndex] && (
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.9)",
          zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }}
        onClick={() => setModalIndex(null)}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={() => setModalIndex(null)}
          style={{
            position: "absolute", top: 20, right: 20,
            background: "rgba(255,255,255,0.15)",
            border: "none", borderRadius: "50%",
            width: 40, height: 40,
            fontSize: 20, color: "#fff",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 201,
          }}
        >
          ✕
        </button>

        {/* 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[modalIndex]}
          alt={`사진 ${modalIndex + 1}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "100%",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: 8,
            userSelect: "none",
          }}
        />

        {/* 이전 화살표 */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setModalIndex((i) => i !== null ? (i - 1 + photos.length) % photos.length : 0); }}
            style={{
              position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: "50%",
              width: 44, height: 44,
              fontSize: 22, color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ‹
          </button>
        )}

        {/* 다음 화살표 */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setModalIndex((i) => i !== null ? (i + 1) % photos.length : 0); }}
            style={{
              position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: "50%",
              width: 44, height: 44,
              fontSize: 22, color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ›
          </button>
        )}

        {/* N/M 카운터 */}
        {photos.length > 1 && (
          <div style={{
            position: "absolute", bottom: 24,
            left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 20, padding: "5px 16px",
            fontSize: 13, color: "rgba(255,255,255,0.8)",
          }}>
            {modalIndex + 1} / {photos.length}
          </div>
        )}

        <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      </div>
    )}
    </div>
  );
}
