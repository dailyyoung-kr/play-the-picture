"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/supabase";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountConflictModal({ isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLoginAndMerge = async () => {
    if (loading) return;
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    // 현재 anon user_id 추출 (signOut 전에)
    const { data: { user } } = await supabase.auth.getUser();
    const anonUserId = user?.id;

    if (!anonUserId || !user?.is_anonymous) {
      console.error("[AccountConflictModal] 현재 anon user 못 찾음");
      setLoading(false);
      return;
    }

    // anon 세션 종료 → Google OAuth (이번엔 link 아닌 새 sign-in, merge_from 파라미터 포함)
    await supabase.auth.signOut();

    const deviceId = getDeviceId();
    const redirectTo = `${window.location.origin}/auth/callback?merge_from=${encodeURIComponent(anonUserId)}&device_id=${encodeURIComponent(deviceId)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("[AccountConflictModal] OAuth 시작 실패:", error.message);
      setLoading(false);
    }
    // 성공 시 브라우저가 Google로 redirect되므로 setLoading(false) 불필요
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
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "linear-gradient(180deg, #1a1820 0%, #0d1218 100%)",
          borderRadius: 20,
          padding: "28px 24px",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>
          이미 Google 계정으로 가입한 이력이 있어요
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 14, lineHeight: 1.5 }}>
          해당 계정으로 로그인할까요?
        </p>
        <div
          style={{
            background: "rgba(196,104,122,0.1)",
            border: "1px solid rgba(196,104,122,0.25)",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 22,
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.5,
          }}
        >
          ⚠ 비회원 로그인 상태로 아카이브에 저장한 기록은 로그인하는 계정에 합쳐져요.
        </div>

        <button
          onClick={handleLoginAndMerge}
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px 16px",
            background: "#C4687A",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
            marginBottom: 8,
          }}
        >
          {loading ? "이동 중..." : "기존 계정으로 로그인"}
        </button>

        <button
          onClick={onClose}
          disabled={loading}
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
          취소
        </button>
      </div>
    </div>
  );
}
