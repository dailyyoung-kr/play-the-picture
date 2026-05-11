"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, User, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function HamburgerMenu() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();
      if (profile) setNickname(profile.nickname);
      setLoaded(true);
    })();
  }, []);

  // 외부 클릭 시 닫기
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

  // 비로그인 또는 로딩 중엔 아무것도 안 보임
  if (!loaded || !nickname) return null;

  return (
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
            minWidth: 240,
            background: "linear-gradient(180deg, #1f1c26 0%, #15141a 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 6,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }`}</style>

          {/* 닉네임 헤더 */}
          <div
            style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
              로그인 계정
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#fff" }}>
              {nickname}
            </div>
          </div>

          {/* 프로필 편집 */}
          <button
            onClick={() => { setIsOpen(false); router.push("/settings"); }}
            style={menuItemStyle}
          >
            <User size={16} strokeWidth={1.8} />
            <span style={{ flex: 1, textAlign: "left" }}>프로필 편집</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>›</span>
          </button>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

          {/* 로그아웃 */}
          <a
            href="/auth/logout"
            style={{ ...menuItemStyle, textDecoration: "none" } as React.CSSProperties}
          >
            <LogOut size={16} strokeWidth={1.8} />
            <span style={{ flex: 1, textAlign: "left" }}>로그아웃</span>
          </a>
        </div>
      )}
    </div>
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
