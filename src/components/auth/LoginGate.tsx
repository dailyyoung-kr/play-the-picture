"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/auth/log";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGuestContinue: () => void;
}

export function LoginGate({ isOpen, onClose, onGuestContinue }: Props) {
  useEffect(() => {
    if (isOpen) {
      logAuthEvent("gate_shown");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    await logAuthEvent("google_login_start");
    const deviceId = getDeviceId();
    const supabase = createSupabaseBrowserClient();
    const callbackUrl = `${window.location.origin}/auth/callback?device_id=${encodeURIComponent(deviceId)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      console.error("[LoginGate] Google OAuth 시작 실패:", error.message);
    }
  };

  const handleGuest = async () => {
    await logAuthEvent("guest_skip");
    onGuestContinue();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
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
          background: "linear-gradient(180deg, #1a1820 0%, #0d1218 100%)",
          borderRadius: "20px 20px 0 0",
          padding: "28px 24px 32px",
          color: "#fff",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>

        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, margin: "0 auto 24px" }} />

        <button
          disabled
          style={{
            width: "100%",
            padding: "14px 16px",
            marginBottom: 10,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            color: "rgba(255,255,255,0.35)",
            fontSize: 15,
            fontWeight: 500,
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>🍎</span>
          <span>Apple로 로그인 (준비 중)</span>
        </button>

        <button
          onClick={handleGoogleLogin}
          style={{
            width: "100%",
            padding: "14px 16px",
            marginBottom: 16,
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

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>또는</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        </div>

        <button
          onClick={handleGuest}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            color: "rgba(255,255,255,0.7)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          가입 없이 시작하기
        </button>
      </div>
    </div>
  );
}
