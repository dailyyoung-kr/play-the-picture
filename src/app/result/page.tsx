"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseWithDeviceId } from "@/lib/supabase";
import { Archive, Music, Play, Pause, Bookmark, RotateCcw, Check } from "lucide-react";

// Instagram 아이콘 — lucide-react가 브랜드 트레이드마크 이슈로 제거함, inline SVG로 대체
const InstagramIcon = ({ size = 15, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

// 카카오톡 아이콘 — 카톡 말풍선 모양 outline
const KakaoTalkIcon = ({ size = 15, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.5 6.7L5.5 21l4.2-2.6c.7.1 1.5.2 2.3.2 5.5 0 10-3.6 10-8s-4.5-8-10-8z" />
  </svg>
);
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
  const [savingStory, setSavingStory] = useState(false);
  // Canvas API로 처리된 storyCard 배경 (lazy — handleStorySave 클릭 시점에만 생성)
  const [storyBgBase64, setStoryBgBase64] = useState<string | null>(null);
  const storyCardRef = useRef<HTMLDivElement>(null);
  // 안드로이드 인스타 인앱 webview용 — navigator.share/<a download> 모두 차단되므로
  // blob을 모달에 <img>로 표시 → 사용자가 long-press로 갤러리 저장
  const [inAppImageUrl, setInAppImageUrl] = useState<string | null>(null);

  // ── iTunes 30초 미리듣기 ──
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "ready" | "playing" | "done">("idle");
  const [previewProgress, setPreviewProgress] = useState(0); // 0~1
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    setTimeout(() => { setToast(""); setToastOnClick(null); }, 5000);
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
    const prefs: { genre?: string } = prefsRaw ? JSON.parse(prefsRaw) : {};

    const { data, error } = await getSupabaseWithDeviceId()
      .from("entries")
      .insert({
        date: today,
        song,
        artist,
        reason: result.reason,
        tags: result.tags,
        emotions: result.emotions ?? {},
        vibe_type: result.vibeType ?? result.vibe_type ?? "",
        vibe_description: result.vibeDescription ?? result.vibe_description ?? "",
        photos,
        album_art: result.albumArt ?? null,
        device_id: getDeviceId(),
        genre: prefs.genre ?? null,
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
        <span>아카이브에 보관됐어요 · <span style={{ color: "#C4687A" }}>모아보기 →</span></span>,
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

      // 공유 funnel 추적 — 'clicked'(시도) → 'completed'/'cancelled'/'fallback'으로 이행
      // POST는 fire-and-forget (await X) — navigator.share user activation 보존 우선.
      // POST 응답에서 row id를 받아 이후 PATCH로 상태 업데이트.
      const logIdPromise: Promise<string | null> = isAnalyticsEnabled()
        ? fetch("/api/log-share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_id: entryId, device_id: getDeviceId(), status: "clicked" }),
          })
            .then(r => r.json())
            .then(d => (typeof d?.id === "string" ? d.id : null))
            .catch(() => null)
        : Promise.resolve(null);

      const patchStatus = (status: "completed" | "cancelled" | "fallback") => {
        logIdPromise.then(id => {
          if (!id) return;
          fetch(`/api/log-share/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }).catch(() => {});
        });
      };

      const url = `https://playthepicture.com/share/${entryId}`;

      // 0) OG 이미지 background pre-trigger — await 없이 fire-and-forget.
      //    이전엔 6초 await했지만, iOS Safari user activation 정책(~5초) 위반으로
      //    navigator.share가 NotAllowedError 발생해 fallback(클립보드 복사)으로 빠짐.
      //    user activation 보존 우선 — 카톡 크롤러는 진행 중 빌드도 timeout 길게(6~10초) 견딤.
      //    Vercel CDN immutable 캐시(/api/og)로 같은 entry는 한 번 빌드 후 영구 캐시.
      fetch(`/api/og?id=${entryId}`).catch(() => {});

      // 1) Web Share API 시도 — URL만 전달해 카톡에서 OG 카드 1개만 노출되도록.
      //    text 동봉 시 노란 말풍선 + OG 카드 2개로 분리되므로, OG 카드 단독 노출 위해 제거.
      if (navigator.share) {
        try {
          await navigator.share({ url });
          patchStatus("completed");
          return; // 성공 시 종료
        } catch (shareErr) {
          const msg = shareErr instanceof Error ? shareErr.message : "";
          const name = shareErr instanceof Error ? shareErr.name : "";
          if (msg.includes("abort") || name === "AbortError" || msg === "AbortError") {
            patchStatus("cancelled");
            return; // 사용자가 취소
          }
          // share 실패 → 클립보드로 fallback
        }
      }

      // 2) 클립보드 복사 시도 — fallback 단계
      try {
        await navigator.clipboard.writeText(url);
        showToast("링크가 복사됐어요! 원하는 곳에 붙여넣어 공유해보세요 ✦");
        patchStatus("fallback");
      } catch {
        // 3) 클립보드도 안 되면 URL 직접 보여주기
        setShareUrl(url);
        patchStatus("fallback");
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


  // 스토리용 이미지 저장 후 음악 스티커 안내 토스트
  const showStorySavedToast = () => {
    if (!result?.song) {
      showToast("스토리용 이미지가 저장됐어요!");
      return;
    }
    const songStr = result.song;
    const dashIdx = songStr.indexOf(" - ");
    const songName = dashIdx >= 0 ? songStr.slice(0, dashIdx).trim() : songStr.trim();
    const artistName = dashIdx >= 0 ? songStr.slice(dashIdx + 3).trim() : "";
    showToast(
      <>
        스토리용 이미지가 저장됐어요!
        <br />
        인스타 스토리에
        <br />
        <strong style={{ color: "#C4687A" }}>
          [{songName}{artistName ? ` - ${artistName}` : ""}]
        </strong>
        <br />
        음악 스티커도 함께 추가해보세요
      </>
    );
  };

  // 안드로이드 인스타 인앱(IABMV) webview 감지 — navigator.share + <a download> 모두 차단됨
  // → 별도 분기로 blob을 모달에 표시 → long-press로 갤러리 저장 유도
  const isAndroidInstagramInApp = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /Android/.test(ua) && /Instagram/.test(ua);
  };

  const closeInAppImageModal = () => {
    if (inAppImageUrl) URL.revokeObjectURL(inAppImageUrl);
    setInAppImageUrl(null);
  };

  // ── 스토리용 이미지 저장 — 9:16 카드 캡처 → Web Share L2 (files) ──
  // 1차: modern-screenshot (SVG foreignObject 기반 — 폰트·이모지·flex 정확)
  // 2차 fallback: html2canvas (라이브러리 실패 시 안전망)
  const handleStorySave = async () => {
    if (!storyCardRef.current || !result) return;
    setSavingStory(true);
    trackEvent("story_save_click", { song: result.song });

    // entries 저장 (이미 보관·공유로 생성됐으면 재사용) — entry_id 매핑용
    const entryId = await saveEntry();

    // story_save_logs 트래킹 — clicked POST 후 status PATCH 흐름 (share_logs 패턴 동일)
    const logIdPromise: Promise<string | null> = isAnalyticsEnabled() && entryId
      ? fetch("/api/log-story-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry_id: entryId, device_id: getDeviceId(), status: "clicked" }),
        })
          .then((r) => r.json())
          .then((d) => (typeof d?.id === "string" ? d.id : null))
          .catch(() => null)
      : Promise.resolve(null);

    const patchStoryStatus = (status: "generated" | "shared" | "cancelled" | "downloaded" | "failed" | "inapp_shown") => {
      logIdPromise.then((id) => {
        if (!id) return;
        fetch(`/api/log-story-save/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).catch(() => {});
      });
    };

    try {
      // Lazy storyBg 생성 (캐시 없으면 proxy fetch + Canvas) — 첫 클릭만 ~1~2초 추가
      if (!storyBgBase64 && result.albumArt) {
        const bg = await prepareStoryBg(result.albumArt);
        if (bg) {
          setStoryBgBase64(bg);
          // React render 반영 대기 (storyCard에 박힌 후 캡처)
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      let blob: Blob | null = null;

      // 캡처 직전 — storyCard 안 모든 img를 강제 decode (이미지 누락 방지)
      const imgs = Array.from(storyCardRef.current.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          if (img.complete && img.naturalWidth > 0) return;
          try {
            await img.decode();
          } catch {
            /* decode 실패해도 진행 */
          }
        })
      );
      console.log("[story-save] 모든 img decode 완료, count:", imgs.length);

      // 1차: html2canvas (Canvas로 사전 처리된 storyBgBase64는 단순 img라 정상 그림 + 폰트는 scale 2 보강)
      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(storyCardRef.current, {
          backgroundColor: "#0d1218",
          useCORS: true,
          allowTaint: true,
          scale: 2, // 폰트 선명도 ↑ (결과 2160×3840)
          logging: false,
          width: 1080,
          height: 1920,
          imageTimeout: 15000,
        });
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        console.log("[story-save] html2canvas 결과 blob:", blob?.size, "bytes");
      } catch (h2cErr) {
        console.warn("[story-save] html2canvas 실패, modern-screenshot로 fallback:", h2cErr);
        // 2차 fallback: modern-screenshot
        const { domToBlob } = await import("modern-screenshot");
        blob = await domToBlob(storyCardRef.current, {
          backgroundColor: "#0d1218",
          width: 1080,
          height: 1920,
          scale: 2,
          type: "image/png",
          quality: 1,
        });
      }

      if (!blob) {
        patchStoryStatus("failed");
        showToast("이미지 생성에 실패했어요. 다시 시도해주세요");
        return;
      }

      patchStoryStatus("generated");

      // 안드로이드 인스타 인앱: navigator.share + <a download> 모두 차단됨
      // → 모달에 이미지 띄워서 사용자가 폰 스크린샷으로 저장
      if (isAndroidInstagramInApp()) {
        const url = URL.createObjectURL(blob);
        setInAppImageUrl(url);
        patchStoryStatus("inapp_shown");
        trackEvent("story_inapp_modal_shown", { song: result?.song });
        return;
      }

      const file = new File([blob], `play-the-picture-story-${Date.now()}.png`, { type: "image/png" });

      // Web Share API Level 2 — files 지원 환경에서 시트 띄움
      const canShareFiles = typeof navigator !== "undefined"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        try {
          await navigator.share({ files: [file] });
          trackEvent("story_share_completed");
          patchStoryStatus("shared");
          showStorySavedToast();
        } catch (e) {
          const name = e instanceof Error ? e.name : "";
          const msg = e instanceof Error ? e.message : "";
          if (name === "AbortError" || msg.includes("abort")) {
            trackEvent("story_share_cancelled");
            patchStoryStatus("cancelled");
            // 사용자 취소 — 토스트 X
          } else {
            // share API 실패 → 다운로드 fallback
            triggerStoryDownload(blob);
            patchStoryStatus("downloaded");
          }
        }
      } else {
        // canShare 미지원 → 다운로드 fallback (데스크탑·구형 브라우저)
        triggerStoryDownload(blob);
        patchStoryStatus("downloaded");
      }
    } catch (e) {
      console.error("[story-save] 오류:", e);
      patchStoryStatus("failed");
      showToast("이미지 생성에 실패했어요. 다시 시도해주세요");
    } finally {
      setSavingStory(false);
    }
  };

  const triggerStoryDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `play-the-picture-story-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStorySavedToast();
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

  // Lazy storyBg 생성: albumArt → proxy fetch → base64 → Canvas (blur+overlay) → JPEG dataURL
  // handleStorySave 클릭 시점에만 호출 (페이지 진입 시 자동 실행 X)
  const prepareStoryBg = async (albumArtUrl: string): Promise<string | null> => {
    try {
      console.log("[storyBg-lazy] proxy fetch 시작");
      const r = await fetch(`/api/proxy-image?url=${encodeURIComponent(albumArtUrl)}`);
      if (!r.ok) {
        console.error("[storyBg-lazy] proxy 실패:", r.status);
        return null;
      }
      const blob = await r.blob();
      const albumArtBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // StackBlur — pure JS pixel blur (iOS Safari 100% 호환, ctx.filter blur 의존 X)
      // img.onload 안에서 await 못 쓰니 closure로 미리 import
      const stackblur = await import("stackblur-canvas");

      // Canvas 처리
      return await new Promise<string | null>((resolve) => {
        const img = new globalThis.Image();
        img.onload = () => {
          try {
            const W = 1080;
            const H = 1920;
            const canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(null);
              return;
            }

            // 어두운 fallback 배경
            ctx.fillStyle = "#0d1218";
            ctx.fillRect(0, 0, W, H);

            const imgRatio = img.naturalWidth / img.naturalHeight;
            const targetRatio = W / H;

            // 강블러 cover (StackBlur) — small canvas에 그리고 StackBlur 적용 후 cover scale 1.5로 upsample
            const STRONG_SMALL = 800;
            const blurStrong = document.createElement("canvas");
            blurStrong.width = STRONG_SMALL;
            blurStrong.height = STRONG_SMALL;
            const bsCtx = blurStrong.getContext("2d");
            if (bsCtx) {
              bsCtx.drawImage(img, 0, 0, STRONG_SMALL, STRONG_SMALL);
              stackblur.canvasRGB(blurStrong, 0, 0, STRONG_SMALL, STRONG_SMALL, 50); // radius 50
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.filter = "brightness(0.55)";
            let coverDw: number, coverDh: number;
            if (imgRatio > targetRatio) {
              coverDh = H;
              coverDw = coverDh * imgRatio;
            } else {
              coverDw = W;
              coverDh = coverDw / imgRatio;
            }
            const coverScaledW = coverDw * 1.5;
            const coverScaledH = coverDh * 1.5;
            ctx.drawImage(blurStrong, (W - coverScaledW) / 2, (H - coverScaledH) / 2, coverScaledW, coverScaledH);

            // 그라데이션 오버레이 (result 패턴 동일: 0.05 → 0.4 → 0.78)
            ctx.filter = "none";
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, "rgba(0,0,0,0.05)");
            grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
            grad.addColorStop(1, "rgba(0,0,0,0.78)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            console.log("[storyBg-lazy] Canvas 처리 완료, 길이:", dataUrl.length);
            resolve(dataUrl);
          } catch (e) {
            console.error("[storyBg-lazy] Canvas 처리 실패:", e);
            resolve(null);
          }
        };
        img.onerror = (e) => {
          console.error("[storyBg-lazy] album image load 실패:", e);
          resolve(null);
        };
        img.src = albumArtBase64;
      });
    } catch (e) {
      console.error("[storyBg-lazy] 전체 실패:", e);
      return null;
    }
  };

  // 재생 중 rAF로 진행도 갱신 (부드러운 애니메이션) + 10초 경과 시 CTA 노출
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
    if (!result?.song) return;
    const songName = result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song;
    const artistName = result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : "";
    if (!songName || !artistName) return;

    const controller = new AbortController();
    fetch(
      `/api/itunes-preview?title=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((d) => {
        trackEvent("preview_match", {
          song: result.song,
          matched: !!d.previewUrl,
          match_score: d.score ?? null,
          cache_hit: !!d.cache_hit,
          page: "result",
        });
        if (d.previewUrl) {
          setPreviewUrl(d.previewUrl);
          setPreviewState("ready");
        }
      })
      .catch(() => {});

    // 페이지 떠날 때 (unmount) 재생 중이었다면 elapsed_sec 기록
    // → preview_pause / preview_complete 이벤트가 발화 안 되는 케이스 보강
    //   (모바일 백그라운드, 페이지 이동, 탭 닫기 등)
    return () => {
      controller.abort();
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended && audio.currentTime > 0) {
        trackEvent("preview_abandoned", {
          song: result?.song,
          elapsed_sec: Math.floor(audio.currentTime),
          page: "result",
        });
      }
    };
  }, [result?.song]);

  // 미리듣기 재생/일시정지 토글
  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewState === "ready") {
      audio.play().then(() => {
        setPreviewState("playing");
        trackEvent("preview_play", { song: result?.song, page: "result" });
        // 듣기 funnel 측정 — fire-and-forget (user activation 영향 0)
        if (isAnalyticsEnabled() && result) {
          const songParts = result.song.split(" - ");
          fetch("/api/log-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_id: getDeviceId(),
              song: songParts[0] ?? result.song,
              artist: songParts.slice(1).join(" - "),
              action: "played",
            }),
          }).catch(() => {});
        }
      }).catch(() => {
        // 재생 실패 시 fallback: 바로 본편 버튼으로
        setPreviewState("done");
      });
    } else if (previewState === "playing") {
      audio.pause();
      trackEvent("preview_pause", { song: result?.song, elapsed_sec: Math.floor(audio.currentTime), page: "result" });
      setPreviewState("ready"); // 일시정지 → 다시 ▶로 복귀 (본편 스왑 X)
    }
  };

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
      <div>

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

      <div className="px-5 pb-2">

        {/* Primary: 미리듣기(미디어 플레이어) → 지금 바로 듣기 (상태별 스왑) */}
        {previewUrl && (
          <audio
            ref={audioRef}
            src={previewUrl}
            preload="none"
            onEnded={() => {
              trackEvent("preview_complete", { song: result?.song, page: "result" });
              // 듣기 funnel 측정 — 30초 완료
              if (isAnalyticsEnabled() && result) {
                const songParts = result.song.split(" - ");
                fetch("/api/log-preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    device_id: getDeviceId(),
                    song: songParts[0] ?? result.song,
                    artist: songParts.slice(1).join(" - "),
                    action: "completed",
                  }),
                }).catch(() => {});
              }
              // 재생 완료 → 다시 듣기 가능하도록 ready로 복귀
              setPreviewState("ready");
              setPreviewProgress(0);
            }}
          />
        )}
        {/* 미리듣기 플레이어: ready/playing 상태에서 노출 */}
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
                marginBottom: 8,
                background: "linear-gradient(180deg, rgba(196,104,122,0.16) 0%, rgba(196,104,122,0.06) 100%)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 24,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.12)",
                cursor: "pointer",
              }}
            >
              {/* 재생/일시정지 원형 버튼 — B안: 핑크 톤다운 (CTA와 경합 해소) */}
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

              {/* 진행바 영역 — 상단에 "미리 듣기" 라벨 중앙 정렬 */}
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

              {/* 시간 표시 */}
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

        {/* Tier 3: 아카이브 저장 + 스토리용 이미지 (한 줄, 회색 secondary) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={handleSaveToSupabase}
            disabled={saving || isSaved}
            style={{
              flex: 1,
              background: isSaved ? "rgba(196,104,122,0.15)" : "rgba(255,255,255,0.14)",
              border: `1px solid ${isSaved ? "rgba(196,104,122,0.4)" : "rgba(255,255,255,0.28)"}`,
              borderRadius: 24, padding: 14,
              color: isSaved ? "#C4687A" : (saving ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.95)"),
              fontSize: 13, cursor: (saving || isSaved) ? "default" : "pointer",
            }}
          >
            {isSaved ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={15} strokeWidth={1.8} /> 보관됨
              </span>
            ) : saving ? (
              "저장 중..."
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Bookmark size={15} strokeWidth={1.5} /> 아카이브 보관
              </span>
            )}
          </button>
          <button
            onClick={handleStorySave}
            disabled={savingStory}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.28)",
              borderRadius: 24, padding: 14,
              color: savingStory ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.95)",
              fontSize: 13, cursor: savingStory ? "default" : "pointer",
            }}
          >
            {savingStory ? (
              "이미지 생성 중..."
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <InstagramIcon size={15} strokeWidth={1.5} /> 스토리용 이미지
              </span>
            )}
          </button>
        </div>

        {/* Tier 2: 결과 공유하기 (단독, 옅은 분홍 — 측정 가능 viral CTA 강조) */}
        <button
          className="font-medium"
          onClick={handleShare}
          disabled={sharing}
          style={{
            width: "100%",
            background: "rgba(196,104,122,0.18)",
            border: "1px solid rgba(196,104,122,0.5)",
            borderRadius: 24,
            padding: 14,
            color: sharing ? "rgba(255,255,255,0.4)" : "#fff",
            fontSize: 13,
            cursor: sharing ? "default" : "pointer",
            marginBottom: 8,
          }}
        >
          {sharing ? (
            "공유 준비 중..."
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <KakaoTalkIcon size={15} strokeWidth={1.5} /> 결과 공유하기
            </span>
          )}
        </button>

        {/* 지금 바로 듣기 CTA — A안 실험: 저장/공유 아래로 이동 (외부 이탈 전 체류 유도) */}
        <button
          className="w-full font-medium"
          onClick={handleListenClick}
          style={{
            background: "#C4687A",
            border: "none",
            borderRadius: 24, padding: 14,
            color: "#fff",
            fontSize: 14, cursor: "pointer",
            marginBottom: 16,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Play size={14} fill="#fff" strokeWidth={0} /> 음악앱에서 듣기
          </span>
        </button>

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
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 0",
            textAlign: "center",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RotateCcw size={13} strokeWidth={1.5} /> 한 번 더 해보기
          </span>
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
            <p style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 6 }}>잠깐! 아래 단계로 공유해주세요</p>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 14, lineHeight: 1.8 }}>
              <div>1️⃣  아래 [링크 복사하기] 버튼 누르기</div>
              <div>2️⃣  메신저 열고 채팅창 들어가기</div>
              <div>3️⃣  채팅창에 붙여넣기</div>
            </div>
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
                  showToast("링크가 복사됐어요! 원하는 곳에 붙여넣어 공유해보세요 ✦");
                  setShareUrl(null);
                } catch {
                  showToast("복사에 실패했어요. 위 링크를 꾹 눌러 직접 복사해주세요!");
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
            padding: "12px 16px",
            borderRadius: 18,
            zIndex: 100,
            maxWidth: "calc(100% - 16px)",
            textAlign: "center",
            lineHeight: 1.55,
            wordBreak: "keep-all",
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

    {/* 안드로이드 인스타 인앱 전용 — 스토리용 이미지 long-press 저장 모달 */}
    {inAppImageUrl && (
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.92)",
          zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "16px 0",
          animation: "fadeIn 0.2s ease",
        }}
        onClick={closeInAppImageModal}
      >
        <button
          onClick={closeInAppImageModal}
          style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(255,255,255,0.15)",
            border: "none", borderRadius: "50%",
            width: 36, height: 36,
            fontSize: 18, color: "#fff",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 201,
          }}
        >
          ✕
        </button>

        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginBottom: 12,
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 20,
            padding: "8px 16px",
            textAlign: "center",
            color: "rgba(255,255,255,0.95)",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.3,
            wordBreak: "keep-all",
            maxWidth: 280,
          }}
        >
          📸 화면을 캡처해 저장하세요
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inAppImageUrl}
          alt="스토리용 이미지"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxHeight: "85vh",
            objectFit: "contain",
            borderRadius: 0,
          }}
        />
      </div>
    )}

    {/* ───────────── 9:16 스토리용 hidden 카드 (1080×1920) ───────────── */}
    {/* html2canvas 캡처 전용 — viewport 밖에 둠 (left: -9999px) */}
    {/* result 페이지 디자인 그대로 차용 + 사진 사이즈만 확대 */}
    <div
      ref={storyCardRef}
      style={{
        position: "absolute",
        left: "-9999px",
        top: 0,
        width: 1080,
        height: 1920,
        background: storyBgBase64 ? "transparent" : "linear-gradient(158deg, #0d1a10 0%, #1a0d18 100%)",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── 배경: Canvas로 미리 blur·overlay 처리된 단일 이미지 (modern-screenshot의 CSS filter 미지원 회피) ── */}
      {storyBgBase64 && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={storyBgBase64}
          alt=""
          decoding="sync"
          loading="eager"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {/* 콘텐츠 영역 */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          padding: "70px 56px 70px",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* ── 상단 앱 이름 + 서브 문구 (result 패턴) ── */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 30,
              letterSpacing: "0.2em",
              color: "#C4687A",
              fontWeight: 300,
              marginBottom: 10,
            }}
          >
            Play the Picture
          </div>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em" }}>
            플더픽의 추천곡
          </div>
        </div>

        {/* ── 사진 영역 — slot 모두 동일 정사각형, 사진은 가운데 1:1 cover (확대 X) ── */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {result && (() => {
            const count = Math.min(photos.length, 5);
            if (count === 0) return null;

            // 장수별 slot 사이즈 (1장·4장 2x2는 세로 영역 큼 → 다른 콘텐츠 잘림 방지로 축소)
            const SIZE = count === 1 ? 760
              : count === 2 ? 474
              : count === 3 ? 309
              : count === 4 ? 380
              : 309; // 5장
            const GAP = 20;
            const BORDER_RADIUS = 32;

            const slot: React.CSSProperties = {
              width: SIZE,
              height: SIZE,
              borderRadius: BORDER_RADIUS,
              overflow: "hidden",
              flexShrink: 0,
              border: "1px solid rgba(255,255,255,0.12)",
            };
            const imgStyle: React.CSSProperties = {
              width: "100%",
              height: "100%",
              objectFit: "cover", // 가운데 1:1 추출, 사진 비율 유지
              objectPosition: "center",
              display: "block",
            };

            if (count === 1) {
              return (
                <div style={slot}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photos[0]} alt="" style={imgStyle} />
                </div>
              );
            }
            if (count === 2) {
              return (
                <div style={{ display: "flex", gap: GAP }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={slot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[i]} alt="" style={imgStyle} />
                    </div>
                  ))}
                </div>
              );
            }
            if (count === 3) {
              // 좌 1장 (큼) + 우 2장 (세로 스택). 좌 높이 = 우×2 + GAP — 빈 공간 없이 꽉 참
              const SMALL = SIZE; // 309
              const LARGE = SMALL * 2 + GAP; // 638
              const smallSlot: React.CSSProperties = { ...slot, width: SMALL, height: SMALL };
              const largeSlot: React.CSSProperties = { ...slot, width: LARGE, height: LARGE };
              return (
                <div style={{ display: "flex", gap: GAP }}>
                  <div style={largeSlot}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photos[0]} alt="" style={imgStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                    <div style={smallSlot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[1]} alt="" style={imgStyle} />
                    </div>
                    <div style={smallSlot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[2]} alt="" style={imgStyle} />
                    </div>
                  </div>
                </div>
              );
            }
            if (count === 4) {
              return (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${SIZE}px)`, gridTemplateRows: `repeat(2, ${SIZE}px)`, gap: GAP }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={slot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[i]} alt="" style={imgStyle} />
                    </div>
                  ))}
                </div>
              );
            }
            // count === 5: 위2 + 아래3 (모두 동일 320×320)
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: GAP, alignItems: "center" }}>
                <div style={{ display: "flex", gap: GAP }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={slot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[i]} alt="" style={imgStyle} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: GAP }}>
                  {[2, 3, 4].map((i) => (
                    <div key={i} style={slot}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[i]} alt="" style={imgStyle} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── 캐릭터 박스 (오늘의 당신은) — result 패턴 그대로 ── */}
        {(result?.vibeType ?? result?.vibe_type) && (
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              borderRadius: 36,
              padding: "36px 40px",
              textAlign: "center",
              marginBottom: 36,
            }}
          >
            <div style={{ fontSize: 28, color: "rgba(255,255,255,0.38)", marginBottom: 18, lineHeight: 1 }}>
              오늘의 당신은
            </div>
            <div
              style={{
                fontSize: 46,
                fontWeight: 500,
                color: "#fff",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              {result?.vibeType ?? result?.vibe_type}
            </div>
            {(result?.vibeDescription ?? result?.vibe_description) && (
              <div style={{ fontSize: 30, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                {result?.vibeDescription ?? result?.vibe_description}
              </div>
            )}
          </div>
        )}

        {/* ── 곡 정보 (result 패턴) ── */}
        {result && (() => {
          const songStr = result.song ?? "";
          const dashIdx = songStr.indexOf(" - ");
          const songName = dashIdx >= 0 ? songStr.slice(0, dashIdx).trim() : songStr.trim();
          const artistName = dashIdx >= 0 ? songStr.slice(dashIdx + 3).trim() : "";
          return (
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: "-0.02em",
                  marginBottom: 14,
                  lineHeight: 1.1,
                }}
              >
                {songName}
              </div>
              {artistName && (
                <div style={{ fontSize: 36, color: "rgba(255,255,255,0.55)" }}>
                  {artistName}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 추천 이유 박스 (result 패턴 — #f0d080 라벨) ── */}
        {result?.reason && (
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              borderRadius: 32,
              padding: "36px 40px",
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: "#f0d080",
                letterSpacing: "0.05em",
                fontWeight: 500,
                marginBottom: 18,
              }}
            >
              플더픽이 추천한 이유
            </div>
            <div style={{ fontSize: 34, color: "rgba(255,255,255,0.78)", lineHeight: 1.7 }}>
              {result.reason}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
