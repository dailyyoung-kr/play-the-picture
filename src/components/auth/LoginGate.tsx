"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/auth/log";

export type LoginGateSource = "photo_upload" | "hamburger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGuestContinue: () => void;
  source?: LoginGateSource;
}

export function LoginGate({ isOpen, onClose, onGuestContinue, source = "photo_upload" }: Props) {
  const [guestLoading, setGuestLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      logAuthEvent("gate_shown", { source });
    }
  }, [isOpen, source]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    // 로깅 fire-and-forget — redirect 지연 X
    logAuthEvent("google_login_start", { source });
    const deviceId = getDeviceId();
    const supabase = createSupabaseBrowserClient();
    const callbackUrl = `${window.location.origin}/auth/callback?device_id=${encodeURIComponent(deviceId)}&attempted=google`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      console.error("[LoginGate] Google OAuth 시작 실패:", error.message);
    }
  };

  const handleAppleLogin = async () => {
    // 로깅 fire-and-forget — redirect 지연 X
    logAuthEvent("apple_login_start", { source });
    const deviceId = getDeviceId();
    const supabase = createSupabaseBrowserClient();
    const callbackUrl = `${window.location.origin}/auth/callback?device_id=${encodeURIComponent(deviceId)}&attempted=apple`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      console.error("[LoginGate] Apple OAuth 시작 실패:", error.message);
    }
  };

  const handleKakaoLogin = () => {
    // 로깅 fire-and-forget — 즉시 redirect
    logAuthEvent("kakao_login_start", { source });
    const deviceId = getDeviceId();
    // 우리 서버 라우트가 카카오 authorize URL을 만들어 redirect — Supabase 표준 provider 아니라 직접 통합
    window.location.href = `/api/auth/kakao/start?device_id=${encodeURIComponent(deviceId)}&action=signin`;
  };

  const handleGuest = async () => {
    if (guestLoading) return;
    setGuestLoading(true);

    // 로깅은 fire-and-forget — 결과 대기 X (UX 응답성 우선)
    logAuthEvent("guest_skip", { source });

    const deviceId = getDeviceId();
    const supabase = createSupabaseBrowserClient();

    // 1. Supabase anonymous sign-in (필수 await — anon user 생성)
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error("[LoginGate] anonymous signin 실패:", error.message);
      logAuthEvent("anonymous_signin_failed", { source, message: error.message });
      setGuestLoading(false);
      onGuestContinue();
      return;
    }

    const userId = data.user?.id;
    // 두 로그 모두 fire-and-forget — user_id는 이미 잡혀있음
    logAuthEvent("anonymous_signin_success", { source }, userId);
    logAuthEvent("signup_complete", { method: "anonymous", source }, userId);

    // 2. device_id 마이그레이션 — fire-and-forget로 변경 (사용자 응답성 우선)
    // /journal은 device_id 기준 query라 migrate 결과 안 기다려도 정상 작동.
    // profile.device_ids·entries.user_id 동기화는 백그라운드에서 수 초 내 완료.
    fetch("/api/auth/migrate-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
    }).catch((e) => {
      console.error("[LoginGate] migrate-device 실패:", e);
    });

    // 3. /?signup=success로 full reload → welcome toast 트리거
    window.location.href = "/?signup=success";
  };

  // "비회원 로그인" = signInAnonymously() — 실제 anon Supabase user 생성. 모든 source에서 노출.

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "linear-gradient(180deg, #c8c1e2 0%, #c2bade 100%)",
          borderRadius: "20px 20px 0 0",
          padding: "28px 24px 32px",
          color: "#2e2547",
          boxShadow: "0 -10px 40px rgba(46,37,71,0.3)",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>

        <div style={{ width: 40, height: 4, background: "rgba(46,37,71,0.2)", borderRadius: 2, margin: "0 auto 24px" }} />

        <button
          onClick={handleAppleLogin}
          style={{
            width: "100%",
            padding: "14px 16px",
            marginBottom: 10,
            background: "#000",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden>
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Apple로 로그인
        </button>

        <button
          onClick={handleGoogleLogin}
          style={{
            width: "100%",
            padding: "14px 16px",
            marginBottom: 10,
            background: "#fff",
            border: "none",
            borderRadius: 12,
            color: "#1a1a1a",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.25h2.92c1.7-1.57 2.68-3.88 2.68-6.6z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853"/>
            <path d="M3.97 10.7a5.4 5.4 0 010-3.4V4.97H.96a9 9 0 000 8.06l3.01-2.33z" fill="#FBBC05"/>
            <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 009 0a9 9 0 00-8.04 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google로 로그인
        </button>

        <button
          onClick={handleKakaoLogin}
          style={{
            width: "100%",
            padding: "14px 16px",
            marginBottom: 16,
            background: "#FEE500",
            border: "none",
            borderRadius: 12,
            color: "#1a1a1a",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.766 1.836 5.197 4.604 6.617L5.4 21l4.34-2.86c.74.092 1.494.14 2.26.14 5.523 0 10-3.477 10-7.78S17.523 3 12 3z" fill="#3C1E1E"/>
          </svg>
          카카오로 로그인
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(46,37,71,0.15)" }} />
          <span style={{ fontSize: 11, color: "rgba(46,37,71,0.45)" }}>또는</span>
          <div style={{ flex: 1, height: 1, background: "rgba(46,37,71,0.15)" }} />
        </div>

        <button
          onClick={handleGuest}
          disabled={guestLoading}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "transparent",
            border: "1px solid rgba(93,79,140,0.3)",
            borderRadius: 12,
            color: guestLoading ? "rgba(46,37,71,0.4)" : "rgba(46,37,71,0.65)",
            fontSize: 14,
            cursor: guestLoading ? "wait" : "pointer",
          }}
        >
          {guestLoading ? "잠시만 기다려주세요..." : "비회원 로그인"}
        </button>

        {/* 약관·정책 동의 안내 (implicit consent — OAuth 간편 로그인 표준 패턴) */}
        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "rgba(46,37,71,0.45)",
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          로그인 시{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#5D4F8C", textDecoration: "underline" }}
          >
            이용약관
          </a>
          과{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#5D4F8C", textDecoration: "underline" }}
          >
            개인정보 처리방침
          </a>
          에 동의한 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}
