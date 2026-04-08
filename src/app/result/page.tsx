"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AnalysisResult {
  song: string; // "곡명 - 아티스트명" 형식
  reason: string;
  tags: string[];
  emotions: {
    "행복함": number;
    "설레임": number;
    "에너지": number;
    "특별함": number;
  };
  hidden_emotion: string;
  vibe_type?: string;
  vibe_description?: string;
  background?: { from: string; to: string };
}

const EMOTION_LABELS = [
  { key: "행복함" as const, emoji: "😊", label: "행복함", color: "#f0d080" },
  { key: "설레임" as const, emoji: "💗", label: "설레임", color: "#f0a0c0" },
  { key: "에너지" as const, emoji: "⚡", label: "에너지", color: "#a0d4f0" },
  { key: "특별함" as const, emoji: "✨", label: "특별함", color: "#a0f0b0" },
];

const PHOTO_COLORS = [
  "linear-gradient(160deg, #1a2a1a, #0a1a0a)",
  "linear-gradient(160deg, #2a2a3a, #1a1a2a)",
  "linear-gradient(160deg, #003850, #001830)",
];

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("ptp_result");
    const photosRaw = localStorage.getItem("ptp_photos");
    if (raw) setResult(JSON.parse(raw));
    if (photosRaw) setPhotos(JSON.parse(photosRaw));
  }, []);

  if (!result) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
      >
        <div className="text-center">
          <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>결과를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: result.background
          ? `linear-gradient(158deg, ${result.background.from} 0%, ${result.background.to} 100%)`
          : "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)"
      }}
    >
      {/* 상단 앱 이름 */}
      <div
        className="text-center pt-12 pb-3"
        style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)" }}
      >
        PLAY THE PICTURE
      </div>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto">

        {/* 오늘의 기록 */}
        <p className="text-center mb-3" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
          오늘의 기록
        </p>

        {/* 사진 3장 */}
        <div className="flex gap-2 justify-center mb-5">
          {(photos.length > 0 ? photos.slice(0, 3) : PHOTO_COLORS).map((src, i) => (
            <div
              key={i}
              style={{
                width: 100,
                height: 124,
                borderRadius: 10,
                border: "1.5px solid rgba(255,255,255,0.13)",
                flexShrink: 0,
                overflow: "hidden",
                background: typeof src === "string" && src.startsWith("data:") ? undefined : PHOTO_COLORS[i],
              }}
            >
              {src.startsWith("data:") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={`사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
          ))}
        </div>

        {/* 노래 정보 — song은 "곡명 - 아티스트명" 형식 */}
        <div className="text-center mb-4">
          <h1 className="font-semibold mb-1" style={{ fontSize: 28, color: "#fff", letterSpacing: "-0.5px" }}>
            {result.song.includes(" - ") ? result.song.split(" - ")[0] : result.song}
          </h1>
          <p className="mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>
            {result.song.includes(" - ") ? result.song.split(" - ").slice(1).join(" - ") : ""}
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {result.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                #{tag.replace(/^#+/, "")}
              </span>
            ))}
          </div>
        </div>

        {/* 감정 분석 카드 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12 }}>
          <p className="mb-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>
            ✦ 오늘 하루 감정 분석
          </p>

          {/* 2x2 그리드 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {EMOTION_LABELS.map(({ key, emoji, label, color }) => {
              const pct = result.emotions[key];
              return (
                <div
                  key={key}
                  style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                      {emoji} {label}
                    </span>
                    <span className="font-medium" style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 사진으로 보는 오늘의 선곡 */}
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>사진으로 보는 오늘의 선곡</p>
            <p className="font-medium" style={{ fontSize: 15, color: "#a0f0b0", marginBottom: 4 }}>
              {result.vibe_type ?? result.hidden_emotion}
            </p>
            {result.vibe_description && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
                {result.vibe_description}
              </p>
            )}
          </div>

          {/* 인사이트 */}
          <p
            className="text-center"
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.40)",
              lineHeight: 1.6,
              marginTop: 12,
              paddingTop: 12,
              borderTop: "0.5px solid rgba(255,255,255,0.08)",
              fontStyle: "italic",
            }}
          >
            {result.reason}
          </p>
        </div>

        {/* 왜 이 노래? */}
        <div className="mb-5" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px" }}>
          <p className="font-medium mb-2" style={{ fontSize: 10, color: "#f0d080", letterSpacing: "0.05em" }}>
            왜 이 노래?
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
            {result.reason}
          </p>
        </div>

        {/* 버튼들 */}
        <button
          className="w-full"
          onClick={() => {
            localStorage.removeItem("ptp_photos");
            localStorage.removeItem("ptp_result");
            router.push("/");
          }}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            cursor: "pointer",
            padding: "8px 0",
            textAlign: "center",
          }}
        >
          다른 사진으로 다시 해볼게
        </button>

        <button
          className="w-full font-medium mb-2"
          style={{ background: "#C4687A", border: "none", borderRadius: 24, padding: 14, color: "#fff", fontSize: 14, cursor: "pointer" }}
        >
          저장하기
        </button>

        <button
          className="w-full flex items-center justify-center gap-2 mb-2"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 24,
            padding: 14,
            color: "rgba(255,255,255,0.75)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          친구에게 공유
        </button>

        <button
          className="w-full font-medium mb-5"
          style={{ background: "#fff", border: "none", borderRadius: 24, padding: 14, color: "#0d1218", fontSize: 14, cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          ▶  지금 바로 듣기
        </button>

      </div>

      {/* 하단 네비게이션 */}
      <div
        style={{
          background: "rgba(0,0,0,0.45)",
          borderTop: "0.5px solid rgba(255,255,255,0.08)",
          display: "flex",
          padding: "10px 0 24px",
          flexShrink: 0,
        }}
      >
        {[
          { icon: "📓", label: "JOURNAL", active: false },
          { icon: "🖼", label: "GALLERY", active: false },
          { icon: "+", label: "UPLOAD", active: true, isCenter: true },
          { icon: "⚙️", label: "SETTINGS", active: false },
        ].map((item) => (
          <div
            key={item.label}
            className="flex-1 flex flex-col items-center gap-1"
            style={{ fontSize: 10, color: item.active ? "#fff" : "rgba(255,255,255,0.38)", cursor: "pointer" }}
          >
            {item.isCenter ? (
              <div style={{ width: 38, height: 38, background: "#C4687A", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", marginTop: -8 }}>
                +
              </div>
            ) : (
              <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                {item.icon}
              </div>
            )}
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
