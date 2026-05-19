"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { logAuthEvent } from "@/lib/auth/log";

const DELETE_WARNING =
  "모든 사진 기록과 추천곡 데이터가 사라져요.\n삭제된 데이터는 복구가 불가해요.";

type Provider = "apple" | "google" | "kakao" | "email" | null;

export function AccountManager() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [provider, setProvider] = useState<Provider>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  // 회원 탈퇴 — 1단계 모달 + 진행 상태
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }
      setUserId(user.id);
      setIsAnonymous(user.is_anonymous === true);
      // provider 우선순위: user_metadata.provider (Kakao) → app_metadata.provider (Google/Apple)
      const meta = user.app_metadata as Record<string, unknown> | undefined;
      const userMeta = user.user_metadata as Record<string, unknown> | undefined;
      setProvider(
        ((userMeta?.provider as Provider) ?? (meta?.provider as Provider)) ??
          null,
      );
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();
      setNickname((profile as { nickname?: string } | null)?.nickname ?? "");
      setLoading(false);
    })();
  }, [router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/");
  };

  // 회원 탈퇴 — 2단계 confirm 후 API 호출
  const handleConfirmDelete = async () => {
    const confirmed = window.confirm("정말 회원 탈퇴할까요?");
    if (!confirmed) return;

    if (deleting) return;
    setDeleting(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 원시 서버 에러는 콘솔에만, 사용자에겐 친근 메시지
        console.error("[AccountManager] 탈퇴 실패:", data.error);
        showToast("탈퇴 처리에 문제가 생겼어요. 잠시 후 다시 시도해주세요");
        setDeleting(false);
        return;
      }

      logAuthEvent("account_deleted", {}, userId);
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("ptp_photos");
        localStorage.removeItem("ptp_result");
        localStorage.removeItem("ptp_prefs");
      } catch {
        /* noop */
      }
      setDeleteModalOpen(false);
      // 홈에서 토스트 표시용 query param. 홈 페이지의 AccountDeletedHandler가 감지 후 URL 정리.
      router.replace("/?account_deleted=1");
    } catch (e) {
      console.error("[AccountManager] delete 실패:", e);
      showToast("네트워크 오류로 탈퇴에 실패했어요");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(46,37,71,0.6)",
          fontSize: 14,
        }}
      >
        잠시만 기다려주세요
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
        color: "#2e2547",
      }}
    >
      {/* 상단 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px 16px 12px",
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="뒤로"
          style={{
            width: 36,
            height: 36,
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#5D4F8C",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={24} strokeWidth={1.8} />
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>계정 관리</h1>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 480, margin: "0 auto" }}>
        {/* 내 계정 정보 카드 */}
        <div
          style={{
            fontSize: 13,
            color: "rgba(46,37,71,0.55)",
            marginBottom: 8,
          }}
        >
          내 계정
        </div>
        <div
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(93,79,140,0.2)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {!isAnonymous && provider === "apple" && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#2e2547" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          {!isAnonymous && provider === "google" && (
            <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.25h2.92c1.7-1.57 2.68-3.88 2.68-6.6z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853"/>
              <path d="M3.97 10.7a5.4 5.4 0 010-3.4V4.97H.96a9 9 0 000 8.06l3.01-2.33z" fill="#FBBC05"/>
              <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 009 0a9 9 0 00-8.04 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {!isAnonymous && provider === "kakao" && (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.766 1.836 5.197 4.604 6.617L5.4 21l4.34-2.86c.74.092 1.494.14 2.26.14 5.523 0 10-3.477 10-7.78S17.523 3 12 3z" fill="#FEE500"/>
            </svg>
          )}
          <span style={{ fontSize: 16, fontWeight: 600, color: "#2e2547" }}>
            {isAnonymous ? "비회원" : nickname || "(닉네임 없음)"}
          </span>
        </div>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(93,79,140,0.2)",
            borderRadius: 12,
            color: "#2e2547",
            fontSize: 14,
            fontWeight: 500,
            cursor: loggingOut ? "not-allowed" : "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 64,
          }}
        >
          {loggingOut ? "로그아웃 중..." : "로그아웃"}
          <span style={{ color: "rgba(46,37,71,0.35)", fontSize: 14 }}>›</span>
        </button>

        {/* 회원 탈퇴 — 위험 액션 */}
        <button
          onClick={() => setDeleteModalOpen(true)}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(176,48,80,0.35)",
            borderRadius: 12,
            color: "#b03050",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          회원 탈퇴
          <span style={{ color: "rgba(176,48,80,0.5)", fontSize: 14 }}>›</span>
        </button>
      </div>

      {/* 1단계 모달 — 정보 + 회원 탈퇴 빨간 버튼 */}
      {deleteModalOpen && (
        <div
          onClick={() => !deleting && setDeleteModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "#ffffff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 8px 32px rgba(46,37,71,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#2e2547",
                marginBottom: 10,
              }}
            >
              회원 탈퇴하시겠어요?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(46,37,71,0.7)",
                lineHeight: 1.6,
                marginBottom: 24,
                whiteSpace: "pre-line",
              }}
            >
              {DELETE_WARNING}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "rgba(93,79,140,0.08)",
                  border: "1px solid rgba(93,79,140,0.2)",
                  borderRadius: 10,
                  color: "#2e2547",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: deleting ? "rgba(176,48,80,0.5)" : "#b03050",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "탈퇴 중..." : "회원 탈퇴"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.96)",
            color: "#2e2547",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            border: "1px solid rgba(93,79,140,0.2)",
            boxShadow: "0 4px 16px rgba(46,37,71,0.18)",
            zIndex: 100,
            whiteSpace: "nowrap",
            maxWidth: "90vw",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
