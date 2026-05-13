"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Music } from "lucide-react";
import { supabase, getDeviceId } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { pixelInitiateCheckout } from "@/lib/fpixel";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { captureUtmFromUrl } from "@/lib/utm";
import { isAuthGateEnabled } from "@/lib/auth/feature-flag";
import { LoginGate } from "@/components/auth/LoginGate";
import { AccountConflictModal } from "@/components/auth/AccountConflictModal";
import { HamburgerMenu } from "@/components/header/HamburgerMenu";

// 사진을 800px 이하로 압축해서 base64로 변환
function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > height && width > MAX) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else if (height > MAX) {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// useSearchParams는 Suspense 경계 안에서만 사용 가능 (Next.js 정적 생성 제약)
function AuthErrorHandler({
  onError,
  onConflict,
}: {
  onError: (msg: string) => void;
  onConflict: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const err = searchParams.get("auth_error");
    if (!err) return;

    if (err === "email_conflict") {
      // 모달로 처리 → URL은 모달 닫힐 때 정리
      onConflict();
    } else {
      onError(`로그인 실패: ${err}`);
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// merge_success=1 감지 → 토스트 표시 + URL 정리
function MergeSuccessHandler({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("merge_success") === "1") {
      onSuccess();
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// 가입 직후 callback에서 /?signup=success로 redirect됨 → 닉네임 fetch 후 welcome toast 표시
function AuthSuccessHandler({ onWelcome }: { onWelcome: (nickname: string) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("signup") !== "success") return;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();
      if (profile) onWelcome(profile.nickname);
      // query param 정리 (새로고침 시 toast 재표시 방지)
      router.replace("/");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  // localStorage는 클라이언트 전용 — hydration 후에 로드 (SSR mismatch 방지)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ptp_photos") ?? "[]");
      if (Array.isArray(stored) && stored.length > 0) setPhotos(stored);
    } catch { /* noop */ }
  }, []);

  // bfcache·back/forward 복원 시 reload는 layout.tsx의 inline script에서 처리 (React가 hydrate 안 되는 케이스 대응)

  const [toast, setToast] = useState("");
  const [showUploadSheet, setShowUploadSheet] = useState(false);  // B안: SETLOG 스타일 모달
  const [loginGateOpen, setLoginGateOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const maxPhotos = 5;

  // URL에 utm_* 있으면 sessionStorage에 저장 (이후 analyze_logs에 기록됨)
  useEffect(() => { captureUtmFromUrl(); }, []);

  // 로그인 상태 체크 (게이트 표시 여부 결정)
  useEffect(() => {
    if (!isAuthGateEnabled()) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.some((f) => f.type.startsWith("video/"))) {
      showToast("사진 파일만 추가할 수 있어요 📷");
      e.target.value = "";
      return;
    }
    if (photos.length >= maxPhotos) {
      showToast("사진은 최대 5장까지 추가할 수 있어요");
      e.target.value = "";
      return;
    }
    const remaining = maxPhotos - photos.length;
    const toProcess = files.slice(0, remaining);
    const compressed = await Promise.all(toProcess.map(compressImage));
    const newPhotos = [...photos, ...compressed];
    setPhotos(newPhotos);
    localStorage.setItem("ptp_photos", JSON.stringify(newPhotos));
    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    localStorage.setItem("ptp_photos", JSON.stringify(newPhotos));
  };

  const proceedToPreference = () => {
    if (isAnalyticsEnabled()) {
      supabase
        .from("photo_upload_logs")
        .insert({ device_id: getDeviceId(), photo_count: photos.length })
        .then(({ error }) => { if (error) console.error("[photo_log]", error.message); });
    }
    pixelInitiateCheckout();
    router.push("/preference");
  };

  const handleNext = () => {
    if (photos.length === 0) return;
    // 게이트 활성화 + 비로그인 시 게이트 노출. anonymous signin도 isLoggedIn=true로 처리됨
    if (isAuthGateEnabled() && !isLoggedIn) {
      setLoginGateOpen(true);
      return;
    }
    proceedToPreference();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
        position: "relative",
      }}
    >
      <HamburgerMenu />

      {/* 숨겨진 파일 입력 */}
      <input
        id="photo-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
        onChange={handleFileSelect}
      />

      {/* 메인 콘텐츠 — 세로 중앙 정렬 */}
      <div className="flex-1 flex flex-col justify-center">

      {/* 상단 앱 로고 */}
      <div className="flex justify-center pb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/play-the-picture-logo-one-line.png"
          alt="Play the Picture"
          style={{ height: 64, width: "auto" }}
        />
      </div>

      {/* 본문 */}
      <div className="flex flex-col px-5">
        {/* 헤드라인 — 가운데 정렬 */}
        <h1
          className="font-semibold text-center"
          style={{ fontSize: 22, color: "#2e2547", lineHeight: 1.4, letterSpacing: "-0.3px" }}
        >
          사진에 딱 맞는 노래를 골라줄게!
        </h1>

        {/* 캐릭터 마스코트 — 픽터 (메인 hero) + 머리 위 썸네일 부채꼴 */}
        <div className="flex justify-center" style={{ marginTop: -20, marginBottom: -70, position: "relative" }}>
          <div style={{ position: "relative", width: 320, height: 320 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/characters/pikter/welcome.png"
              alt=""
              className="pixel-art"
              style={{ width: 320, height: 320 }}
            />
            {/* 머리 위 썸네일 — 카드 패처럼 펼친 역 U자 (완만한 기울기) */}
            {photos.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 30,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: -6,
                  zIndex: 5,
                  pointerEvents: "none",
                }}
              >
                {photos.map((src, i) => {
                  const center = (photos.length - 1) / 2;
                  const offset = i - center;
                  const rotation = offset * 7; // ±7°씩 회전 (완만)
                  const yDown = Math.abs(offset) * 4; // 가운데 가장 높고 양옆 살짝 아래 (역 U자)
                  return (
                    <div
                      key={i}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        overflow: "hidden",
                        marginLeft: i === 0 ? 0 : -6, // 카드 살짝 겹침
                        transform: `translateY(${yDown}px) rotate(${rotation}deg)`,
                        transformOrigin: "50% 100%", // 카드 아래쪽 중심으로 회전 (부채 펼치는 효과)
                        border: "2px solid #fff",
                        boxShadow: "0 2px 8px rgba(46,37,71,0.25)",
                        background: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 픽터 말풍선 — 픽터가 말하는 듯한 효과 (반투명 그레이톤) */}
        <div className="flex justify-center" style={{ marginBottom: 18 }}>
          <div
            className="font-handwritten"
            style={{
              position: "relative",
              background: "rgba(255,255,255,0.4)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: 18,
              padding: "10px 20px",
              border: "1px solid rgba(93,79,140,0.12)",
              fontSize: 16,
              color: "rgba(46,37,71,0.9)",
              fontWeight: 700,
              maxWidth: "85%",
              textAlign: "center",
            }}
          >
            {/* 말풍선 꼬리 — 외곽 (보더 컬러 삼각형) */}
            <div
              style={{
                position: "absolute",
                top: -8,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: "8px solid rgba(93,79,140,0.12)",
              }}
            />
            {/* 말풍선 꼬리 — 내부 (배경 컬러 삼각형, 한 픽셀 아래로) */}
            <div
              style={{
                position: "absolute",
                top: -6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderBottom: "7px solid rgba(255,255,255,0.4)",
              }}
            />
            {photos.length === 0
              ? "오늘 사진을 기다리는 중..."
              : "이제 음악 찾아볼까?"}
          </div>
        </div>

        {/* + 버튼 — 페블 스타일 (보라 그라데이션 + 깊이감) */}
        <div className="flex justify-center" style={{ marginBottom: 28 }}>
          <button
            type="button"
            onClick={() => setShowUploadSheet(true)}
            style={{
              padding: "11px 28px",
              borderRadius: 16,
              background: "linear-gradient(180deg, #7B6CB0 0%, #5D4F8C 55%, #4A3F73 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              lineHeight: 1,
              boxShadow: "0 6px 14px rgba(46,37,71,0.28), 0 2px 4px rgba(46,37,71,0.18), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.1)",
              textShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}
            aria-label="사진 추가"
          >
            +
          </button>
        </div>

        {/* 안내 스텝 — + 버튼 아래 (SETLOG 스타일 — 큰 번호 + 인라인 UI 참조) */}
        {!showUploadSheet && (
          <div style={{ marginBottom: 24, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
            {/* Step 1 */}
            <div className="flex items-start gap-3 mb-4">
              <div style={{
                flexShrink: 0,
                width: 28, height: 28, borderRadius: "50%",
                background: "#ffffff", color: "#5D4F8C",
                border: "2px solid #5D4F8C",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
                marginTop: -1,
              }}>1</div>
              <div style={{ fontSize: 14, color: "rgba(46,37,71,0.85)", lineHeight: 1.6 }}>
                위의{" "}
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22, height: 22,
                  borderRadius: 7,
                  background: "linear-gradient(180deg, #7B6CB0 0%, #5D4F8C 55%, #4A3F73 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  verticalAlign: "middle",
                  lineHeight: 1,
                  margin: "0 2px",
                  boxShadow: "0 2px 4px rgba(46,37,71,0.22), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}>+</span>{" "}
                버튼으로 사진을 추가해주세요
                <div style={{ fontSize: 12, color: "rgba(46,37,71,0.55)", marginTop: 3 }}>
                  최대 5장 · 노래 추천에만 사용돼요
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div style={{
                flexShrink: 0,
                width: 28, height: 28, borderRadius: "50%",
                background: "#ffffff", color: "#5D4F8C",
                border: "2px solid #5D4F8C",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
                marginTop: -1,
              }}>2</div>
              <div style={{ fontSize: 14, color: "rgba(46,37,71,0.85)", lineHeight: 1.6 }}>
                아래{" "}
                <span style={{
                  display: "inline-block",
                  padding: "2px 9px",
                  borderRadius: 10,
                  background: "rgba(93,79,140,0.12)",
                  color: "#5D4F8C",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid rgba(93,79,140,0.35)",
                  verticalAlign: "middle",
                  margin: "0 1px",
                }}>노래 찾으러 가기</span>{" "}
                버튼을 눌러주세요
                <div style={{ fontSize: 12, color: "rgba(46,37,71,0.55)", marginTop: 3 }}>
                  픽터가 분위기를 읽고 딱 맞는 한 곡을 골라드려요
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 메인 CTA — 노래 찾으러 가기 (사진 있을 때만 표시) */}
        {!showUploadSheet && photos.length > 0 && (
          <button
            onClick={handleNext}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 24,
              background: "#5D4F8C",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            노래 찾으러 가기
          </button>
        )}

        {/* 섹션 타이틀 + 카운트 배지 (모달 안에서만 표시) */}
        {/* B안 — 바텀 시트 모달: 사진 슬롯 + 안내 + CTA */}
        {showUploadSheet && (
          <div
            onClick={() => setShowUploadSheet(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(46,37,71,0.5)",
              zIndex: 100,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#ffffff",
                borderRadius: "20px 20px 0 0",
                padding: "24px 20px 32px",
                width: "100%",
                maxWidth: 500,
                maxHeight: "85vh",
                overflowY: "auto",
                boxShadow: "0 -4px 24px rgba(46,37,71,0.15)",
              }}
            >
              {/* 시트 핸들 */}
              <div style={{
                width: 36, height: 4, background: "rgba(46,37,71,0.2)",
                borderRadius: 2, margin: "0 auto 20px",
              }} />

              {/* 헤더 — 타이틀 + 닫기 */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold" style={{ fontSize: 18, color: "#2e2547" }}>
                  사진 추가
                </h2>
                <button
                  type="button"
                  onClick={() => setShowUploadSheet(false)}
                  style={{
                    background: "rgba(46,37,71,0.08)", border: "none",
                    width: 32, height: 32, borderRadius: "50%",
                    fontSize: 14, color: "#2e2547", cursor: "pointer",
                  }}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
        {/* 사진 슬롯 — 가로 스크롤 */}
        <div style={{ position: "relative", marginBottom: 8 }}>
        <div className="no-scrollbar" style={{ display: "flex", flexDirection: "row", gap: 8, overflowX: "auto", paddingRight: photos.length >= 3 ? 40 : 0 }}>
          {photos.map((src, i) => (
            <div
              key={i}
              style={{
                width: 100, height: 124, borderRadius: 10,
                overflow: "hidden", position: "relative", flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`사진 ${i + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <button
                onClick={() => removePhoto(i)}
                style={{
                  position: "absolute", top: 5, right: 5,
                  width: 18, height: 18,
                  background: "rgba(0,0,0,0.6)", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: "#fff", cursor: "pointer", border: "none",
                }}
              >
                ✕
              </button>
            </div>
          ))}

          {/* + 슬롯 (5장 미만일 때만) */}
          {photos.length < maxPhotos && (
            <label
              htmlFor="photo-input"
              style={{
                width: 100, height: 124, borderRadius: 10, flexShrink: 0,
                border: "1px solid rgba(93,79,140,0.4)",
                background: "rgba(255,255,255,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: "rgba(93,79,140,0.7)",
                cursor: "pointer",
              }}
            >
              +
            </label>
          )}
        </div>
          {/* 오른쪽 페이드 그라데이션 — 3장 이상일 때만 */}
          {photos.length >= 3 && (
            <div style={{
              position: "absolute", top: 0, right: 0,
              width: 60, height: "100%",
              background: "linear-gradient(to right, transparent 0%, #ffffff 100%)",
              pointerEvents: "none",
            }} />
          )}
        </div>

        {/* 안내 문구 */}
        <p className="text-right" style={{ fontSize: 11, color: "rgba(46,37,71,0.55)", marginTop: 12 }}>
          최대 5장까지 추가할 수 있어요
        </p>
        <p className="text-right" style={{ fontSize: 11, color: "rgba(46,37,71,0.55)", marginBottom: 20 }}>
          사진은 노래 추천에만 사용돼요 ·{" "}
          <a
            href="/privacy"
            style={{ color: "rgba(93,79,140,0.8)", textDecoration: "none" }}
          >
            자세히
          </a>
        </p>

        {/* 단일 CTA — 상태별 전환 */}
        {photos.length === 0 ? (
          <label
            htmlFor="photo-input"
            className="w-full mb-2"
            style={{
              display: "block",
              background: "#5D4F8C",
              border: "none",
              borderRadius: 24,
              padding: 14,
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            사진 추가하기
          </label>
        ) : (
          <button
            className="w-full font-medium mb-2"
            onClick={() => setShowUploadSheet(false)}
            style={{
              background: "#5D4F8C",
              border: "none",
              borderRadius: 24,
              padding: 14,
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            사진 추가 완료
          </button>
        )}
            </div>
          </div>
        )}

      </div>
      </div>{/* 메인 콘텐츠 wrapper 끝 */}

      {/* 토스트 메시지 */}
      {toast && (
        <div style={{
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
        }}>
          {toast}
        </div>
      )}

      {/* 하단 네비게이션 */}
      <div style={{ background: "rgba(255,255,255,0.7)", borderTop: "0.5px solid rgba(46,37,71,0.12)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px" }}>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(46,37,71,0.55)", cursor: "pointer" }} onClick={() => router.push("/journal")}>
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#2e2547", cursor: "pointer" }} onClick={() => router.push("/")}>
          <Music size={22} strokeWidth={1.5} />
          노래 추천받기
        </div>
      </div>

      <LoginGate
        isOpen={loginGateOpen}
        onClose={() => setLoginGateOpen(false)}
        onGuestContinue={() => {
          // anonymous signin 실패 fallback — 그냥 모달만 닫음
          // (정상 흐름은 LoginGate 내부에서 signInAnonymously + full reload 처리)
          setLoginGateOpen(false);
        }}
        source="photo_upload"
      />

      <Suspense fallback={null}>
        <AuthErrorHandler
          onError={showToast}
          onConflict={() => setConflictModalOpen(true)}
        />
        <AuthSuccessHandler onWelcome={(nick) => showToast(`${nick}님, 환영해요!`)} />
        <MergeSuccessHandler onSuccess={() => showToast("기존 계정으로 로그인됐어요!")} />
      </Suspense>

      <AccountConflictModal
        isOpen={conflictModalOpen}
        onClose={() => {
          setConflictModalOpen(false);
          // URL의 auth_error 정리
          if (typeof window !== "undefined") {
            router.replace("/");
          }
        }}
      />
    </div>
  );
}
