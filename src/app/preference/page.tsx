"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";
import { trackEvent } from "@/lib/gtag";
import { supabase, getDeviceId } from "@/lib/supabase";

const GENRE_OPTIONS = [
  { value: "discover",      label: "장르 발견하기",  apiGenre: "장르 발견하기" },
  { value: "kpop",          label: "K-POP",          apiGenre: "K-POP" },
  { value: "pop",           label: "팝",              apiGenre: "팝" },
  { value: "hiphop",        label: "힙합",            apiGenre: "힙합" },
  { value: "indie",         label: "인디",            apiGenre: "인디" },
  { value: "rnb",           label: "R&B/소울",        apiGenre: "R&B/소울" },
  { value: "acoustic_jazz", label: "어쿠스틱/재즈",  apiGenre: "어쿠스틱/재즈" },
];

const ENERGY_OPTIONS = [
  { value: 1, label: "잔잔함" },
  { value: 2, label: "여유" },
  { value: 3, label: "설렘" },
  { value: 4, label: "신남" },
  { value: 5, label: "파워풀" },
];

// energy → preference_logs DB 저장용 mood/listeningStyle 매핑
function getLegacyParams(energy: number) {
  if (energy <= 2) return { mood: "여유로워", listeningStyle: "휴식" };
  if (energy === 3) return { mood: "설레",    listeningStyle: "산책/드라이브" };
  return              { mood: "신나",         listeningStyle: "출근/등교길" };
}

const VIBE_AXES = [
  { left: "차분함", right: "에너제틱" },
  { left: "쿨함",   right: "따뜻함" },
  { left: "혼자",   right: "함께" },
  { left: "일상적", right: "특별함" },
];
const WAVE_DELAYS = [0, 0.18, 0.36, 0.18, 0];
const PHASE3_TEXTS = [
  "딱 맞는 한 곡을 찾고 있어요",
  "취향을 분석하고 있어요",
  "오늘의 분위기와 어울리는 곡을 고르고 있어요",
  "거의 다 됐어요",
  "더 잘 어울리는 곡이 있을 것 같네요",
  "당신이 좋아할만한 곡을 찾아볼게요",
  "조금만 더 기다려주세요, 거의 다 됐어요",
  "딱 한 곡이라 신중하게 고르고 있어요",
  "플더픽이 최선을 다하고 있어요 🎵",
];

export default function PreferencePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState("indie");
  const [selectedEnergy, setSelectedEnergy] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 3단계 로딩 상태
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState<string[]>([]);
  const [photosFadeIn, setPhotosFadeIn] = useState(false);
  const [gaugeTargets, setGaugeTargets] = useState<number[]>([0, 0, 0, 0]);
  const [gaugeAnimated, setGaugeAnimated] = useState(false);

  // 3단계 텍스트 순환 상태
  const [phase3TextIndex, setPhase3TextIndex] = useState(0);
  const [phase3TextVisible, setPhase3TextVisible] = useState(true);

  useEffect(() => {
    if (!loading) {
      setLoadingPhase(0);
      setPhotosFadeIn(false);
      setGaugeAnimated(false);
      return;
    }

    const photosRaw = localStorage.getItem("ptp_photos");
    const photos: string[] = photosRaw ? JSON.parse(photosRaw) : [];
    setLoadingPhotos(photos.slice(0, 3));

    setGaugeTargets([
      Math.floor(Math.random() * 60) + 20,  // 차분함 ↔ 에너제틱
      Math.floor(Math.random() * 60) + 20,  // 쿨함 ↔ 따뜻함
      Math.floor(Math.random() * 60) + 20,  // 혼자 ↔ 함께
      Math.floor(Math.random() * 60) + 20,  // 일상적 ↔ 특별함
      Math.floor(Math.random() * 26) + 54,
    ]);

    setLoadingPhase(0);
    setPhotosFadeIn(false);
    setGaugeAnimated(false);

    const tFade = setTimeout(() => setPhotosFadeIn(true), 150);
    const t1 = setTimeout(() => {
      setLoadingPhase(1);
      setTimeout(() => setGaugeAnimated(true), 120);
    }, 3000);
    const t2 = setTimeout(() => setLoadingPhase(2), 6000);

    return () => {
      clearTimeout(tFade);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  // 3단계 텍스트: index 0~3 순차 → 4~8 루프
  useEffect(() => {
    if (loadingPhase !== 2) {
      setPhase3TextIndex(0);
      setPhase3TextVisible(true);
      return;
    }

    setPhase3TextIndex(0);
    setPhase3TextVisible(true);

    const timers: ReturnType<typeof setTimeout>[] = [];
    let loopInterval: ReturnType<typeof setInterval> | undefined;

    for (let i = 1; i <= 3; i++) {
      const base = i * 4000;
      timers.push(setTimeout(() => setPhase3TextVisible(false), base - 400));
      const idx = i;
      timers.push(setTimeout(() => {
        setPhase3TextIndex(idx);
        setPhase3TextVisible(true);
      }, base));
    }

    const LOOP = [4, 5, 6, 7, 8];
    let step = 0;
    timers.push(setTimeout(() => {
      loopInterval = setInterval(() => {
        setPhase3TextVisible(false);
        const nextIdx = LOOP[step % LOOP.length];
        step++;
        setTimeout(() => {
          setPhase3TextIndex(nextIdx);
          setPhase3TextVisible(true);
        }, 400);
      }, 4000);
    }, 16000));

    return () => {
      timers.forEach(clearTimeout);
      if (loopInterval) clearInterval(loopInterval);
    };
  }, [loadingPhase]);

  const handleAnalyze = async () => {
    const photosRaw = localStorage.getItem("ptp_photos");
    const photos: string[] = photosRaw ? JSON.parse(photosRaw) : [];

    if (photos.length === 0) {
      setError("사진을 먼저 추가해주세요.");
      return;
    }

    const deviceId = getDeviceId();
    const startTime = Date.now();
    const genreOption = GENRE_OPTIONS.find(g => g.value === selectedGenre) ?? GENRE_OPTIONS[0];
    const { mood: legacyMood, listeningStyle: legacyStyle } = getLegacyParams(selectedEnergy);

    // 취향 선택 로그 (energy 컬럼 있으면 포함, 없으면 기본 필드만)
    supabase
      .from("preference_logs")
      .insert({ device_id: deviceId, genre: selectedGenre, energy: selectedEnergy, mood: legacyMood, listening_style: legacyStyle })
      .then(({ error }) => {
        if (error) {
          // energy 컬럼 없을 경우 fallback
          supabase
            .from("preference_logs")
            .insert({ device_id: deviceId, genre: selectedGenre, mood: legacyMood, listening_style: legacyStyle })
            .then(({ error: e2 }) => { if (e2) console.error("[pref_log]", e2.message); });
        }
      });

    // 분석 시작 로그
    let logId: string | null = null;
    try {
      const { data: logData } = await supabase
        .from("analyze_logs")
        .insert({ device_id: deviceId, status: "start" })
        .select("id")
        .single();
      logId = logData?.id ?? null;
    } catch { /* ignore */ }

    trackEvent("analyze_start", { genre: selectedGenre, energy: selectedEnergy });
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos,
          genre: genreOption.apiGenre,
          energy: selectedEnergy,
        }),
      });

      const data = await res.json();
      const responseTimeMs = Date.now() - startTime;

      if (!res.ok) {
        if (logId) await supabase.from("analyze_logs").update({ status: "fail", response_time_ms: responseTimeMs, error_reason: data.error ?? "unknown" }).eq("id", logId);
        throw new Error(data.error || "분석에 실패했어요.");
      }

      if (logId) {
        const songStr = (data.song as string) ?? "";
        const dashIdx = songStr.indexOf(" - ");
        const logSong = dashIdx >= 0 ? songStr.slice(0, dashIdx).trim() : songStr.trim();
        const logArtist = dashIdx >= 0 ? songStr.slice(dashIdx + 3).trim() : "";
        await supabase.from("analyze_logs").update({
          status: "success",
          response_time_ms: responseTimeMs,
          song: logSong,
          artist: logArtist,
          spotify_status: data.spotifyTrackId ? "found" : "not_found",
        }).eq("id", logId);
      }

      localStorage.setItem("ptp_result", JSON.stringify(data));
      localStorage.setItem("ptp_prefs", JSON.stringify({ genre: selectedGenre, energy: selectedEnergy }));
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
      style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
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
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>2 / 2</span>
      </div>

      <p className="text-center mb-5" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
        두 가지만 알려주시면 딱 맞는 노래를 찾아드릴게요
      </p>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto">

        {/* 카드 1: 장르 */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-3 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🎵 어떤 음악이 끌려요?
          </p>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((g) => (
              <button
                key={g.value}
                onClick={() => setSelectedGenre(g.value)}
                style={{
                  background: selectedGenre === g.value ? "#C4687A" : "rgba(255,255,255,0.07)",
                  border: selectedGenre === g.value ? "none" : "1px solid rgba(255,255,255,0.16)",
                  color: selectedGenre === g.value ? "#fff" : "rgba(255,255,255,0.62)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* 카드 2: 분위기 (에너지 스펙트럼) */}
        <div className="mb-3 p-4" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-4 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🎚️ 어떤 분위기로 듣고 싶어요?
          </p>

          {/* 스펙트럼 바 */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {ENERGY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedEnergy(opt.value)}
                style={{
                  flex: 1,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: selectedEnergy === opt.value
                    ? "rgba(196,104,122,0.30)"
                    : "rgba(255,255,255,0.07)",
                  border: selectedEnergy === opt.value
                    ? "1.5px solid #C4687A"
                    : "1px solid rgba(255,255,255,0.13)",
                  borderRadius: 10,
                  color: selectedEnergy === opt.value ? "#fff" : "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  fontWeight: selectedEnergy === opt.value ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 스펙트럼 라벨 */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>잔잔</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>파워풀</span>
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
          {[false, true].map((active, i) => (
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

          {/* ── 2단계: 바이브 스펙트럼 ── */}
          {loadingPhase === 1 && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {loadingPhotos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.14)", opacity: 0.65 }} />
                ))}
                {loadingPhotos.length === 0 && (
                  <div style={{ width: 72, height: 90, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
                )}
              </div>
              <p style={{ color: "#C4687A", fontSize: 13, marginBottom: 28, textAlign: "center", letterSpacing: "0.04em" }}>
                사진의 분위기를 파악했어요 ✦
              </p>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
                {VIBE_AXES.map(({ left, right }, i) => (
                  <div key={left}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{left}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{right}</span>
                    </div>
                    <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                      <div style={{
                        position: "absolute",
                        left: gaugeAnimated ? `calc(${gaugeTargets[i]}% - 7px)` : "calc(50% - 7px)",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "#C4687A",
                        boxShadow: "0 0 6px rgba(196,104,122,0.6)",
                        transition: `left ${0.75 + i * 0.12}s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.1}s`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 3단계: 곡 탐색 중 ── */}
          {loadingPhase === 2 && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
                {loadingPhotos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.14)", opacity: 0.5 }} />
                ))}
                {loadingPhotos.length === 0 && (
                  <div style={{ width: 72, height: 90, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
                )}
              </div>
              <div style={{ fontSize: 52, marginBottom: 28, color: "#C4687A" }}>✦</div>

              <div
                style={{
                  position: "relative",
                  height: 52,
                  width: "100%",
                  textAlign: "center",
                  overflow: "hidden",
                }}
              >
                {PHASE3_TEXTS.map((text, i) => (
                  <p
                    key={i}
                    style={{
                      position: "absolute",
                      width: "100%",
                      left: 0,
                      top: 0,
                      margin: 0,
                      color: "#fff",
                      fontSize: 17,
                      fontWeight: 500,
                      letterSpacing: "-0.3px",
                      lineHeight: 1.55,
                      opacity: i === phase3TextIndex && phase3TextVisible ? 1 : 0,
                      transition: "opacity 0.4s ease",
                    }}
                  >
                    {text}
                  </p>
                ))}
              </div>

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
