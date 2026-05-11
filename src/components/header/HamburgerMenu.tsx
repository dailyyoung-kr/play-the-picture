"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/supabase";
import { LoginGate } from "@/components/auth/LoginGate";
import { isAuthGateEnabled } from "@/lib/auth/feature-flag";
import { logAuthEvent } from "@/lib/auth/log";

export function HamburgerMenu() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loginGateOpen, setLoginGateOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthGateEnabled()) {
      setLoaded(true);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }
      setUserId(user.id);
      setIsAnonymous(user.is_anonymous === true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();
      if (profile) setNickname(profile.nickname);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!loaded) return null;
  if (!isAuthGateEnabled()) return null;

  const isLoggedIn = !!nickname;

  const handleLoginClick = () => {
    setIsOpen(false);
    setLoginGateOpen(true);
  };

  const handleLinkGoogle = async () => {
    setIsOpen(false);
    await logAuthEvent("identity_link_start", { provider: "google" }, userId);
    const deviceId = getDeviceId();
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?device_id=${encodeURIComponent(deviceId)}`,
      },
    });
    if (error) {
      console.error("[HamburgerMenu] linkIdentity 실패:", error.message);
      await logAuthEvent("identity_link_failed", { provider: "google", message: error.message }, userId);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 16, right: 16, zIndex: 50 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="메뉴"
          style={{
            width: 40,
            height: 40,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
          }}
        >
          <Menu size={20} strokeWidth={1.8} />
        </button>

        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: 48,
              right: 0,
              minWidth: 280,
              background: "linear-gradient(180deg, #1f1c26 0%, #15141a 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 6,
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              animation: "fadeIn 0.15s ease-out",
            }}
          >
            <style>{`@keyframes fadeIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }`}</style>

            {/* 헤더 — 닉네임 (vibe-style pill chip) / 게스트 안내 */}
            <div
              style={{
                padding: "14px 14px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 4,
              }}
            >
              {isLoggedIn ? (
                <>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                    {isAnonymous ? "비회원" : "로그인 계정"}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#fff",
                      lineHeight: 1.3,
                    }}
                  >
                    {nickname}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                  게스트로 사용 중
                </div>
              )}
            </div>

            {isLoggedIn ? (
              <>
                {isAnonymous && (
                  <>
                    {/* 섹션 헤더 — 이모지 제거 */}
                    <div
                      style={{
                        padding: "12px 14px 8px",
                        fontSize: 11,
                        color: "rgba(255,255,255,0.4)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      정식 계정으로 전환
                    </div>

                    {/* Google 계정 연동 — 버튼 스타일 */}
                    <button onClick={handleLinkGoogle} style={oauthButtonStyle}>
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.25h2.92c1.7-1.57 2.68-3.88 2.68-6.6z" fill="#4285F4" />
                        <path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853" />
                        <path d="M3.97 10.7a5.4 5.4 0 010-3.4V4.97H.96a9 9 0 000 8.06l3.01-2.33z" fill="#FBBC05" />
                        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 009 0a9 9 0 00-8.04 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
                      </svg>
                      <span style={{ flex: 1, textAlign: "left" }}>Google 계정 연동</span>
                    </button>

                    {/* Apple 계정 연동 (준비중) — 버튼 스타일 disabled */}
                    <button disabled style={{ ...oauthButtonStyle, cursor: "not-allowed", color: "rgba(255,255,255,0.35)", borderColor: "rgba(255,255,255,0.06)" } as React.CSSProperties}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)" style={{ flexShrink: 0 }}>
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                      </svg>
                      <span style={{ flex: 1, textAlign: "left" }}>Apple 계정 연동 (준비중)</span>
                    </button>

                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0 4px" }} />
                  </>
                )}

                {/* 프로필 편집 — 아이콘 제거 */}
                <button
                  onClick={() => { setIsOpen(false); router.push("/settings"); }}
                  style={menuItemStyle}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>프로필 편집</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>›</span>
                </button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* 로그아웃 — 아이콘 제거 */}
                <a
                  href="/auth/logout"
                  style={{ ...menuItemStyle, textDecoration: "none" } as React.CSSProperties}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>로그아웃</span>
                </a>
              </>
            ) : (
              <>
                {/* 로그인 (게스트) — 아이콘 제거 */}
                <button onClick={handleLoginClick} style={menuItemStyle}>
                  <span style={{ flex: 1, textAlign: "left" }}>로그인</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <LoginGate
        isOpen={loginGateOpen}
        onClose={() => setLoginGateOpen(false)}
        onGuestContinue={() => setLoginGateOpen(false)}
        source="hamburger"
      />
    </>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "transparent",
  border: "none",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  gap: 12,
  color: "rgba(255,255,255,0.85)",
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.15s",
};

// OAuth provider 버튼 — 메뉴 항목보다 비주얼 weight 높임 (CTA 강조)
const oauthButtonStyle: React.CSSProperties = {
  width: "calc(100% - 12px)",
  margin: "0 6px 6px",
  padding: "11px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
};
