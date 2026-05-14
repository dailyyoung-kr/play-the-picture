"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, User } from "lucide-react";
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
  const [provider, setProvider] = useState<string | null>(null);
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
      // provider 우선순위:
      //   1) user_metadata.provider (Kakao — admin.createUser 시 우리가 명시)
      //   2) app_metadata.provider (Google/Apple — Supabase OAuth 자동)
      //   Kakao user는 app_metadata.provider="email"로 채워지므로 user_metadata 먼저 봐야 함
      const meta = user.app_metadata as Record<string, unknown> | undefined;
      const userMeta = user.user_metadata as Record<string, unknown> | undefined;
      setProvider(
        (userMeta?.provider as string | undefined) ??
          (meta?.provider as string | undefined) ??
          null,
      );
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

  const handleLinkKakao = async () => {
    setIsOpen(false);
    await logAuthEvent("identity_link_start", { provider: "kakao" }, userId);
    // 카카오는 Supabase 표준 OAuth 아니라 우리 라우트가 인증·user 매칭 처리
    // anon 사용자가 link 시도 → merge_from에 현재 anon user_id를 넘겨야 callback에서 데이터 merge
    const deviceId = getDeviceId();
    if (!userId) {
      // anon user_id가 없으면 link 의미 없음 — 일반 sign-in flow
      window.location.href = `/api/auth/kakao/start?device_id=${encodeURIComponent(deviceId)}&action=signin`;
      return;
    }
    window.location.href = `/api/auth/kakao/start?device_id=${encodeURIComponent(deviceId)}&merge_from=${encodeURIComponent(userId)}&action=link`;
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 16, right: 16, zIndex: 50 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isLoggedIn ? "내 계정" : "메뉴"}
          style={{
            width: 40,
            height: 40,
            background: "rgba(255,255,255,0.6)",
            border: "none",
            borderRadius: 12,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#2e2547",
            boxShadow: "0 2px 8px rgba(46,37,71,0.15)",
            cursor: "pointer",
          }}
        >
          {isLoggedIn ? (
            <User size={18} strokeWidth={1.8} />
          ) : (
            <MoreHorizontal size={20} strokeWidth={1.8} />
          )}
        </button>

        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: 48,
              right: 0,
              minWidth: 280,
              background: "rgba(255,255,255,0.97)",
              border: "1px solid rgba(93,79,140,0.2)",
              borderRadius: 14,
              padding: 6,
              boxShadow: "0 10px 30px rgba(46,37,71,0.18)",
              animation: "fadeIn 0.15s ease-out",
            }}
          >
            <style>{`@keyframes fadeIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }`}</style>

            {/* 헤더 — 닉네임 (vibe-style pill chip) / 게스트 안내 */}
            <div
              style={{
                padding: "14px 14px 12px",
                borderBottom: "1px solid rgba(46,37,71,0.1)",
                marginBottom: 4,
              }}
            >
              {isLoggedIn ? (
                <>
                  {isAnonymous && (
                    <div style={{ fontSize: 11, color: "rgba(46,37,71,0.45)", marginBottom: 6 }}>
                      비회원
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#2e2547",
                      lineHeight: 1.3,
                    }}
                  >
                    {!isAnonymous && provider === "kakao" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                        <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.766 1.836 5.197 4.604 6.617L5.4 21l4.34-2.86c.74.092 1.494.14 2.26.14 5.523 0 10-3.477 10-7.78S17.523 3 12 3z" fill="#FEE500"/>
                      </svg>
                    )}
                    {!isAnonymous && provider === "google" && (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                        <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.25h2.92c1.7-1.57 2.68-3.88 2.68-6.6z" fill="#4285F4" />
                        <path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853" />
                        <path d="M3.97 10.7a5.4 5.4 0 010-3.4V4.97H.96a9 9 0 000 8.06l3.01-2.33z" fill="#FBBC05" />
                        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 009 0a9 9 0 00-8.04 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
                      </svg>
                    )}
                    <span>{nickname}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(46,37,71,0.55)" }}>
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
                        color: "rgba(46,37,71,0.45)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      정식 계정으로 전환
                    </div>

                    {/* 카카오 계정 연동 — 한국 18-24 여성 친숙도 ↑ */}
                    <button onClick={handleLinkKakao} style={{ ...oauthButtonStyle, background: "#FEE500", color: "#1a1a1a", borderColor: "#FEE500" } as React.CSSProperties}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                        <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.766 1.836 5.197 4.604 6.617L5.4 21l4.34-2.86c.74.092 1.494.14 2.26.14 5.523 0 10-3.477 10-7.78S17.523 3 12 3z" fill="#3C1E1E"/>
                      </svg>
                      <span style={{ flex: 1, textAlign: "left" }}>카카오 계정 연동</span>
                    </button>

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

                    <div style={{ height: 1, background: "rgba(46,37,71,0.1)", margin: "8px 0 4px" }} />
                  </>
                )}

                {/* 프로필 편집 — 아이콘 제거 */}
                <button
                  onClick={() => { setIsOpen(false); router.push("/settings"); }}
                  style={menuItemStyle}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>프로필 편집</span>
                  <span style={{ color: "rgba(46,37,71,0.35)", fontSize: 14 }}>›</span>
                </button>

                <div style={{ height: 1, background: "rgba(46,37,71,0.1)", margin: "4px 0" }} />

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
  color: "#2e2547",
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.15s",
};

// OAuth provider 버튼 — 메뉴 항목보다 비주얼 weight 높임 (CTA 강조)
const oauthButtonStyle: React.CSSProperties = {
  width: "calc(100% - 12px)",
  margin: "0 6px 6px",
  padding: "11px 12px",
  background: "rgba(93,79,140,0.06)",
  border: "1px solid rgba(93,79,140,0.2)",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#2e2547",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
};
