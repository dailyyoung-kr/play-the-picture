"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";

const GENRES = ["발라드", "인디", "K-POP", "힙합/R&B", "팝", "재즈/어쿠스틱", "장르 발견하기"];
const MOODS = ["신나", "설레", "여유로워", "복잡해", "지쳐"];
const LISTENING_STYLES = ["출근/등교길", "작업/공부", "데이트", "휴식", "산책/드라이브", "잠들기 전"];

export default function PreferencePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState("발라드");
  const [selectedMood, setSelectedMood] = useState("신나");
  const [selectedStyle, setSelectedStyle] = useState("출근/등교길");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    const photosRaw = localStorage.getItem("ptp_photos");
    const photos: string[] = photosRaw ? JSON.parse(photosRaw) : [];

    if (photos.length === 0) {
      setError("사진을 먼저 추가해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos,
          genre: selectedGenre,
          mood: selectedMood,
          listeningStyle: selectedStyle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "분석에 실패했어요.");
      }

      localStorage.setItem("ptp_result", JSON.stringify(data));
      router.push("/result");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
      }}
    >
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-5 pt-12 pb-5">
        <button
          onClick={() => router.back()}
          style={{ fontSize: 20, color: "rgba(255,255,255,0.65)", background: "none", border: "none", cursor: "pointer" }}
        >
          ←
        </button>
        <span className="font-medium" style={{ fontSize: 15, color: "#fff" }}>
          오늘의 취향
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>2 / 3</span>
      </div>

      <p className="text-center mb-5" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
        조금만 더 알려주면 딱 맞는 노래를 찾아줄게
      </p>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto">

        {/* 카드 1: 장르 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-3 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🎵 평소에 즐겨 듣는 장르는?
          </p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                style={{
                  background: selectedGenre === genre ? "#C4687A" : "rgba(255,255,255,0.07)",
                  border: selectedGenre === genre ? "none" : "1px solid rgba(255,255,255,0.16)",
                  color: selectedGenre === genre ? "#fff" : "rgba(255,255,255,0.62)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* 카드 2: 기분 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-3 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🌤 지금 이 순간 기분이 어때?
          </p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => (
              <button
                key={mood}
                onClick={() => setSelectedMood(mood)}
                style={{
                  background: selectedMood === mood ? "rgba(160,212,160,0.18)" : "rgba(255,255,255,0.07)",
                  border: selectedMood === mood ? "1px solid #a0d4a0" : "1px solid rgba(255,255,255,0.16)",
                  color: selectedMood === mood ? "#a0d4a0" : "rgba(255,255,255,0.62)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {mood}
              </button>
            ))}
          </div>
        </div>

        {/* 카드 3: 듣는 방식 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-3 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🎵 지금 뭐 하면서 들을 거야?
          </p>
          <div className="flex flex-wrap gap-2">
            {LISTENING_STYLES.map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(style)}
                style={{
                  background: selectedStyle === style ? "rgba(196,104,122,0.22)" : "rgba(255,255,255,0.07)",
                  border: selectedStyle === style ? "1px solid #C4687A" : "1px solid rgba(255,255,255,0.16)",
                  color: selectedStyle === style ? "#fff" : "rgba(255,255,255,0.62)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* 오류 메시지 */}
        {error && (
          <p className="text-center mb-2" style={{ fontSize: 12, color: "#f0a0a0" }}>
            {error}
          </p>
        )}

        {/* 스텝 점 */}
        <div className="flex gap-2 justify-center py-3">
          {[false, true, false].map((active, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: active ? "#fff" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>

        {/* AI 분석 시작 버튼 */}
        <button
          className="w-full font-medium mb-2"
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            background: loading ? "rgba(196,104,122,0.5)" : "#C4687A",
            border: "none",
            borderRadius: 24,
            padding: 14,
            color: "#fff",
            fontSize: 14,
            cursor: loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {loading ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>✦</span>
              사진 분석 중...
            </>
          ) : (
            "AI 분석 시작하기 ✦"
          )}
        </button>
        <p className="text-center mb-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
          사진 속 감정을 읽어 노래를 찾아드려요
        </p>
      </div>

      {/* 로딩 오버레이 */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(13,18,24,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 40 }}>✦</div>
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>분위기 분석 중...</p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>사진 속 감정을 읽고 있어요</p>
        </div>
      )}

      {/* 하단 네비게이션 */}
      <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px" }}>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", cursor: "pointer" }} onClick={() => router.push("/journal")}>
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#fff", cursor: "pointer" }} onClick={() => router.push("/")}>
          <Music size={22} strokeWidth={1.5} />
          노래 추천받기
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
