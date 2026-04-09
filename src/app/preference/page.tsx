"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";

const GENRES = ["발라드", "인디", "K-POP", "힙합/R&B", "팝", "재즈/어쿠스틱", "장르 발견하기"];
const MOODS = ["신나", "설레", "여유로워", "복잡해", "지쳐"];
const LISTENING_STYLES = ["출근/등교길", "작업/공부", "데이트", "휴식", "산책/드라이브", "잠들기 전"];
const EMOTION_LABELS = ["행복함", "설레임", "에너지", "특별함"];
const WAVE_DELAYS = [0, 0.18, 0.36, 0.18, 0]; // 막대 5개 animation-delay

export default function PreferencePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState("발라드");
  const [selectedMood, setSelectedMood] = useState("신나");
  const [selectedStyle, setSelectedStyle] = useState("출근/등교길");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 3단계 로딩 상태
  const [loadingPhase, setLoadingPhase] = useState(0); // 0 | 1 | 2
  const [loadingPhotos, setLoadingPhotos] = useState<string[]>([]);
  const [photosFadeIn, setPhotosFadeIn] = useState(false);
  const [gaugeTargets, setGaugeTargets] = useState<number[]>([0, 0, 0, 0]);
  const [gaugeAnimated, setGaugeAnimated] = useState(false);


  useEffect(() => {
    if (!loading) {
      setLoadingPhase(0);
      setPhotosFadeIn(false);
      setGaugeAnimated(false);
      return;
    }

    // 사진 불러오기
    const photosRaw = localStorage.getItem("ptp_photos");
    const photos: string[] = photosRaw ? JSON.parse(photosRaw) : [];
    setLoadingPhotos(photos.slice(0, 3));

    // 랜덤 게이지 값 생성
    setGaugeTargets([
      Math.floor(Math.random() * 28) + 52,
      Math.floor(Math.random() * 30) + 44,
      Math.floor(Math.random() * 32) + 38,
      Math.floor(Math.random() * 26) + 54,
    ]);

    setLoadingPhase(0);
    setPhotosFadeIn(false);
    setGaugeAnimated(false);

    // 사진 fade-in 시작
    const tFade = setTimeout(() => setPhotosFadeIn(true), 150);

    // 1단계 → 2단계 (3초)
    const t1 = setTimeout(() => {
      setLoadingPhase(1);
      setTimeout(() => setGaugeAnimated(true), 120);
    }, 3000);

    // 2단계 → 3단계 (6초)
    const t2 = setTimeout(() => {
      setLoadingPhase(2);
    }, 6000);

    return () => {
      clearTimeout(tFade);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

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
        조금만 더 알려주시면 딱 맞는 노래를 찾아드릴게요
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
            🌤️ 지금 이 순간 기분이 어때요?
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
            🎵 지금 뭐 하면서 들을 거예요?
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
          플더픽이 오늘의 한 곡을 찾아드릴게요
        </p>
      </div>

      {/* 로딩 오버레이 — 3단계 스토리텔링 */}
      {loading && !error && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 55%, #1a1408 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "0 36px",
          }}
        >
          {/* ── 1단계: 사진 분석 중 ── */}
          {loadingPhase === 0 && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 36 }}>
                {loadingPhotos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    style={{
                      width: 88,
                      height: 110,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1.5px solid rgba(255,255,255,0.18)",
                      opacity: photosFadeIn ? 1.0 : 0.35,
                      transition: "opacity 2.6s ease",
                    }}
                  />
                ))}
                {/* 사진이 없으면 플레이스홀더 */}
                {loadingPhotos.length === 0 && (
                  <div style={{
                    width: 88, height: 110, borderRadius: 10,
                    background: "rgba(255,255,255,0.07)",
                    border: "1.5px solid rgba(255,255,255,0.12)",
                  }} />
                )}
              </div>
              <p style={{ color: "#fff", fontSize: 17, fontWeight: 500, textAlign: "center", letterSpacing: "-0.3px" }}>
                사진 속 오늘을 읽고 있어요 🔍
              </p>
              <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, marginTop: 10, textAlign: "center" }}>
                사진의 분위기를 분석하는 중이에요
              </p>
            </>
          )}

          {/* ── 2단계: 감정 게이지 ── */}
          {loadingPhase === 1 && (
            <>
              <p style={{ color: "#C4687A", fontSize: 13, marginBottom: 28, textAlign: "center", letterSpacing: "0.04em" }}>
                오늘의 분위기를 파악했어요 ✦
              </p>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
                {EMOTION_LABELS.map((label, i) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{label}</span>
                      <span style={{ fontSize: 12, color: "#C4687A", fontWeight: 500 }}>{gaugeTargets[i]}%</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.09)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: gaugeAnimated ? `${gaugeTargets[i]}%` : "0%",
                          background: "linear-gradient(to right, #C4687A, #e8a0b0)",
                          borderRadius: 3,
                          transition: `width ${0.75 + i * 0.12}s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.08}s`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 3단계: 곡 탐색 중 ── */}
          {loadingPhase === 2 && (
            <>
              <div
                style={{
                  fontSize: 52,
                  marginBottom: 28,
                  animation: "pulse 1.2s ease-in-out infinite",
                  color: "#C4687A",
                }}
              >
                ✦
              </div>
              <p style={{ color: "#fff", fontSize: 17, fontWeight: 500, textAlign: "center", letterSpacing: "-0.3px" }}>
                딱 맞는 한 곡을 찾고 있어요 🎵
              </p>

              {/* 음악 파형 애니메이션 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 24,
                  height: 32,
                }}
              >
                {WAVE_DELAYS.map((delay, i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      borderRadius: 2,
                      background: "#C4687A",
                      animation: `wave 0.8s ease-in-out ${delay}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 에러 오버레이 */}
      {!loading && error && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(13,18,24,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 50,
            padding: "0 32px",
          }}
        >
          <div style={{ fontSize: 36 }}>🙏</div>
          <p style={{ color: "#fff", fontSize: 15, fontWeight: 500, textAlign: "center", lineHeight: 1.6 }}>
            {error}
          </p>
          <button
            onClick={() => setError("")}
            style={{
              marginTop: 8,
              background: "#C4687A",
              border: "none",
              borderRadius: 24,
              padding: "12px 32px",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            다시 시도하기
          </button>
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
        @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
        @keyframes wave { from { height: 8px; } to { height: 32px; } }
      `}</style>
    </div>
  );
}
