"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { logAuthEvent } from "@/lib/auth/log";

const MAX_LENGTH = 13;

export function NicknameEditor() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [originalNickname, setOriginalNickname] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

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
      </div>

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
