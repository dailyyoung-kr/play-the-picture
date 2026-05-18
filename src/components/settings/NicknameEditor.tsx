"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { logAuthEvent } from "@/lib/auth/log";

const MAX_LENGTH = 13;

// 계정 삭제 — 1단계 모달에서 표시
const DELETE_WARNING = "모든 사진 기록과 추천곡 데이터가 사라져요. 삭제된 데이터는 복구가 불가해요.";

export function NicknameEditor() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [originalNickname, setOriginalNickname] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  // 계정 삭제 — 1단계 모달 노출 + 진행 상태
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // 비로그인 → 홈으로 redirect (auth guard)
        router.replace("/");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();

      if (profile) {
        setOriginalNickname(profile.nickname);
        setNickname(profile.nickname);
      }
      setLoading(false);
    })();
  }, [router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleSave = async () => {
    if (!userId || saving) return;
    const trimmed = nickname.trim();

    if (trimmed.length < 1) {
      showToast("닉네임을 1자 이상 입력해주세요");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      showToast(`닉네임은 ${MAX_LENGTH}자 이하로 입력해주세요`);
      return;
    }
    if (trimmed === originalNickname) {
      // 변경 없음 → 그냥 뒤로
      router.back();
      return;
    }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("profiles")
      .update({ nickname: trimmed, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("[NicknameEditor] update 실패:", error.message);
      showToast(`저장 실패: ${error.message}`);
      setSaving(false);
      return;
    }

    logAuthEvent("nickname_changed", { from: originalNickname, to: trimmed }, userId);
    setOriginalNickname(trimmed);
    showToast("닉네임이 변경됐어요");
    setSaving(false);
    setTimeout(() => router.back(), 800);
  };

  const hasChange = nickname.trim() !== originalNickname && nickname.trim().length >= 1;

  // 계정 삭제 — 2단계 confirm 후 API 호출
  const handleConfirmDelete = async () => {
    // 2단계: 시스템 confirm (브라우저 native dialog로 무게감 추가)
    const confirmed = window.confirm("정말 계정을 삭제할까요?");
    if (!confirmed) return;

    if (deleting) return;
    setDeleting(true);
    const supabase = createSupabaseBrowserClient();
    try {
      // Bearer 토큰 헤더로 서버 인증 (쿠키 세션 fallback도 서버에서 처리됨)
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
        showToast(`삭제 실패: ${data.error ?? "알 수 없는 오류"}`);
        setDeleting(false);
        return;
      }

      logAuthEvent("account_deleted", {}, userId);
      // 로컬 세션·캐시 모두 클리어
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("ptp_photos");
        localStorage.removeItem("ptp_result");
        localStorage.removeItem("ptp_prefs");
      } catch {
        /* noop */
      }
      setDeleteModalOpen(false);
      // 홈으로 이동 + 토스트는 home에서 query param으로 표시할 수 있지만 일단 단순 redirect
      router.replace("/");
    } catch (e) {
      console.error("[NicknameEditor] delete 실패:", e);
      showToast("네트워크 오류로 삭제에 실패했어요");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
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
        background: "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)",
        color: "#2e2547",
      }}
    >
      {/* 상단 헤더 — 뒤로가기 + 타이틀 */}
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
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>설정</h1>
      </div>

      {/* 본문 */}
      <div style={{ padding: "20px 20px 40px", maxWidth: 480, margin: "0 auto" }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            color: "rgba(46,37,71,0.55)",
            marginBottom: 8,
          }}
        >
          닉네임
        </label>

        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="닉네임 입력"
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(93,79,140,0.25)",
            borderRadius: 12,
            color: "#2e2547",
            fontSize: 16,
            outline: "none",
          }}
        />

        <div
          style={{
            textAlign: "right",
            fontSize: 11,
            color: "rgba(46,37,71,0.4)",
            marginTop: 6,
            marginBottom: 28,
          }}
        >
          {nickname.length} / {MAX_LENGTH}
        </div>

        <button
          onClick={handleSave}
          disabled={!hasChange || saving}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: hasChange ? "#5D4F8C" : "rgba(93,79,140,0.3)",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            cursor: hasChange && !saving ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>

        {/* 계정 삭제 영역 — 위험 액션 */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: "1px solid rgba(46,37,71,0.1)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "rgba(46,37,71,0.5)",
              marginBottom: 10,
              letterSpacing: 0.2,
            }}
          >
            위험 영역
          </div>
          <button
            onClick={() => setDeleteModalOpen(true)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "transparent",
              border: "1px solid rgba(176,48,80,0.35)",
              borderRadius: 10,
              color: "#b03050",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            계정 삭제
            <span style={{ color: "rgba(176,48,80,0.5)", fontSize: 14 }}>›</span>
          </button>
        </div>
      </div>

      {/* 1단계 모달 — 정보 전달 + 계정 삭제 버튼 (빨강) */}
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
              계정을 삭제하시겠어요?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(46,37,71,0.7)",
                lineHeight: 1.6,
                marginBottom: 24,
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
                {deleting ? "삭제 중..." : "계정 삭제"}
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
