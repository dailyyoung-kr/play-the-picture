"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { trackEvent } from "@/lib/gtag";
import { getDeviceId } from "@/lib/device";
import { isAnalyticsEnabled } from "@/lib/analytics";

interface Props {
  song: string;       // 곡명 (artist 빼고)
  artist: string;     // 아티스트
  pageContext: string; // tracking metadata용 ("result" | "journal" | ...)
}

const PREVIEW_DURATION = 30;

/**
 * iTunes 30초 미리듣기 플레이어.
 *
 * Behavior
 * - mount 시 iTunes API에서 preview URL 조회 (fire-and-forget). URL 없으면 컴포넌트 렌더 X.
 * - 재생/일시정지 토글 + 진행바 drag-to-scrub.
 * - unmount 시 audio 명시적 pause + abandoned 이벤트.
 *
 * Tracking events
 * - preview_match (GA4): URL 조회 직후. matched·match_score·cache_hit 포함.
 * - preview_play (GA4) + /api/log-preview (DB): 사용자 재생 클릭.
 * - preview_pause (GA4): 일시정지. elapsed_sec 포함.
 * - preview_complete (GA4) + /api/log-preview (DB): 30초 완료.
 * - preview_abandoned (GA4): 재생 중 unmount.
 */
export function PreviewPlayer({ song, artist, pageContext }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "ready" | "playing" | "done">("idle");
  const [previewProgress, setPreviewProgress] = useState(0); // 0~1
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // drag-to-scrub state
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const wasPlayingBeforeDragRef = useRef(false);
  const seekBarRef = useRef<HTMLDivElement>(null);

  // 재생 중 rAF로 진행도 갱신
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

  // iTunes 미리듣기 URL 조회 + cleanup
  useEffect(() => {
    if (!song || !artist) return;
    const controller = new AbortController();
    fetch(
      `/api/itunes-preview?title=${encodeURIComponent(song)}&artist=${encodeURIComponent(artist)}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((d) => {
        trackEvent("preview_match", {
          song: `${song} - ${artist}`,
          matched: !!d.previewUrl,
          match_score: d.score ?? null,
          cache_hit: !!d.cache_hit,
          page: pageContext,
        });
        if (d.previewUrl) {
          setPreviewUrl(d.previewUrl);
          setPreviewState("ready");
        }
      })
      .catch(() => {});

    // unmount: 재생 중이었으면 abandoned 이벤트 + 명시적 pause (브라우저 동작 의존 X)
    return () => {
      controller.abort();
      const audio = audioRef.current;
      if (audio) {
        if (!audio.paused && !audio.ended && audio.currentTime > 0) {
          trackEvent("preview_abandoned", {
            song: `${song} - ${artist}`,
            elapsed_sec: Math.floor(audio.currentTime),
            page: pageContext,
          });
        }
        audio.pause();
      }
    };
  }, [song, artist, pageContext]);

  // 재생·일시정지 토글
  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewState === "ready") {
      audio
        .play()
        .then(() => {
          setPreviewState("playing");
          trackEvent("preview_play", { song: `${song} - ${artist}`, page: pageContext });
          if (isAnalyticsEnabled()) {
            fetch("/api/log-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                device_id: getDeviceId(),
                song,
                artist,
                action: "played",
              }),
            }).catch(() => {});
          }
        })
        .catch(() => {
          setPreviewState("done");
        });
    } else if (previewState === "playing") {
      audio.pause();
      trackEvent("preview_pause", {
        song: `${song} - ${artist}`,
        elapsed_sec: Math.floor(audio.currentTime),
        page: pageContext,
      });
      setPreviewState("ready");
    }
  };

  // preview URL 없으면 컴포넌트 자체 렌더 X (호출하는 쪽에서 자리 차지 안 함)
  if (!previewUrl || previewState === "idle" || previewState === "done") {
    return previewUrl ? (
      // done 상태에서도 audio element는 유지 (재생 완료 시 다시 ready로 복귀 처리 위해)
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="none"
        onEnded={() => {
          trackEvent("preview_complete", { song: `${song} - ${artist}`, page: pageContext });
          if (isAnalyticsEnabled()) {
            fetch("/api/log-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                device_id: getDeviceId(),
                song,
                artist,
                action: "completed",
              }),
            }).catch(() => {});
          }
          setPreviewState("ready");
          setPreviewProgress(0);
        }}
      />
    ) : null;
  }

  const visualProgress = isDragging ? dragProgress : previewProgress;
  const elapsed = Math.floor(visualProgress * PREVIEW_DURATION);
  const fmt = (s: number) => `0:${String(Math.max(0, s)).padStart(2, "0")}`;
  const calcProgress = (clientX: number): number => {
    const rect = seekBarRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="none"
        onEnded={() => {
          trackEvent("preview_complete", { song: `${song} - ${artist}`, page: pageContext });
          if (isAnalyticsEnabled()) {
            fetch("/api/log-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                device_id: getDeviceId(),
                song,
                artist,
                action: "completed",
              }),
            }).catch(() => {});
          }
          setPreviewState("ready");
          setPreviewProgress(0);
        }}
      />
      <div
        role="button"
        onClick={togglePreview}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          marginBottom: 8,
          background: "linear-gradient(180deg, rgba(93,79,140,0.16) 0%, rgba(93,79,140,0.06) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 24,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.12)",
          cursor: "pointer",
        }}
      >
        {/* 재생/일시정지 원형 버튼 */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {previewState === "ready" ? (
            <Play size={14} fill="#fff" strokeWidth={0} style={{ marginLeft: 1 }} />
          ) : (
            <Pause size={14} fill="#fff" strokeWidth={0} />
          )}
        </div>

        {/* 진행바 영역 + "30초 들어보기" 라벨 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.02em",
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            30초 들어보기
          </div>
          <div
            ref={seekBarRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              const audio = audioRef.current;
              wasPlayingBeforeDragRef.current = previewState === "playing";
              if (audio && previewState === "playing") {
                audio.pause();
                setPreviewState("ready");
              }
              const p = calcProgress(e.clientX);
              setDragProgress(p);
              setIsDragging(true);
            }}
            onPointerMove={(e) => {
              if (!isDragging) return;
              e.stopPropagation();
              setDragProgress(calcProgress(e.clientX));
            }}
            onPointerUp={(e) => {
              if (!isDragging) return;
              e.stopPropagation();
              e.currentTarget.releasePointerCapture(e.pointerId);
              const final = calcProgress(e.clientX);
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = final * PREVIEW_DURATION;
              }
              setPreviewProgress(final);
              setIsDragging(false);
              if (wasPlayingBeforeDragRef.current && audio) {
                audio.play().then(() => setPreviewState("playing")).catch(() => {});
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              height: 24,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                height: 3,
                borderRadius: 2,
                background: "rgba(255,255,255,0.15)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: `${visualProgress * 100}%`,
                height: 3,
                borderRadius: 2,
                background: "#5D4F8C",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: `${visualProgress * 100}%`,
                transform: "translate(-50%, -50%)",
                width: isDragging ? 14 : 10,
                height: isDragging ? 14 : 10,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                transition: isDragging ? "none" : "width 0.15s, height 0.15s",
              }}
            />
          </div>
        </div>

        {/* 시간 표시 */}
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            fontVariantNumeric: "tabular-nums",
            minWidth: 56,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {fmt(elapsed)} / 0:30
        </div>
      </div>
      {/* iTunes API 약관 (iii) 어트리뷰션 */}
      <div style={{ fontSize: 9, color: "rgba(128,128,128,0.7)", textAlign: "center", marginTop: 4, marginBottom: 8, letterSpacing: "0.02em" }}>
        미리듣기 제공: iTunes
      </div>
    </>
  );
}
