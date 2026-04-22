"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";
import { trackEvent } from "@/lib/gtag";
import { supabase, getDeviceId } from "@/lib/supabase";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { getUtm } from "@/lib/utm";

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
const WAVE_BARS = [
  { delay: 0,    duration: 0.72, anim: "wave1" },
  { delay: 0.18, duration: 0.88, anim: "wave2" },
  { delay: 0.32, duration: 0.64, anim: "wave3" },
  { delay: 0.08, duration: 0.80, anim: "wave2" },
  { delay: 0.26, duration: 0.70, anim: "wave1" },
  { delay: 0.04, duration: 0.92, anim: "wave3" },
];
const PHASE3_TEXTS = [
  "딱 맞는 한 곡을 고르고 있어요",
  "거의 다 골랐어요",
  "플더픽이 플레이리스트를 뒤적이는 중...",
  "다른 곡과 한번 더 비교하는 중",
  "한 곡인 만큼 신중하게",
  "마지막으로 한번 더 확인해볼게요",
];

export default function PreferencePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState("discover");
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
    setLoadingPhotos(photos);

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

  // 3단계 텍스트: 0→5 순차 3초 간격, 마지막 [5]에서 정지 (루프 없음)
  useEffect(() => {
    if (loadingPhase !== 2) {
      setPhase3TextIndex(0);
      setPhase3TextVisible(true);
      return;
    }

    setPhase3TextIndex(0);
    setPhase3TextVisible(true);

    const timers: ReturnType<typeof setTimeout>[] = [];
    const LAST = PHASE3_TEXTS.length - 1;

    for (let i = 1; i <= LAST; i++) {
      const base = i * 3000;
      timers.push(setTimeout(() => setPhase3TextVisible(false), base - 300));
      const idx = i;
      timers.push(setTimeout(() => {
        setPhase3TextIndex(idx);
        setPhase3TextVisible(true);
      }, base));
    }

    return () => {
      timers.forEach(clearTimeout);
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

    // 취향 선택 로그 (서버 API 경유 → supabaseAdmin으로 RLS 우회)
    if (isAnalyticsEnabled()) {
      fetch("/api/log-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre: selectedGenre, energy: selectedEnergy, device_id: deviceId }),
      }).catch(() => {});
    }

    // 분석 시작 로그
    let logId: string | null = null;
    if (isAnalyticsEnabled()) {
      try {
        const utm = getUtm();
        const { data: logData } = await supabase
          .from("analyze_logs")
          .insert({
            device_id: deviceId,
            status: "start",
            utm_source: utm.utm_source ?? null,
            utm_medium: utm.utm_medium ?? null,
            utm_campaign: utm.utm_campaign ?? null,
          })
          .select("id")
          .single();
        logId = logData?.id ?? null;
      } catch { /* ignore */ }
    }

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
          deviceId,
        }),
      });

      const data = await res.json();
      const responseTimeMs = Date.now() - startTime;

      if (!res.ok) {
        if (logId) await supabase.from("analyze_logs").update({
          status: "fail",
          response_time_ms: responseTimeMs,
          error_reason: data.error ?? "unknown",
          error_code: data.error_code ?? "unknown",
        }).eq("id", logId);
        throw new Error(data.error || "분석에 실패했어요.");
      }

      if (isAnalyticsEnabled() && logId) {
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
          perf_db_ms: (data.perfDbMs as number | undefined) ?? null,
          perf_claude_ms: (data.perfClaudeMs as number | undefined) ?? null,
          photo_count: (data.photoCount as number | undefined) ?? photos.length,
        }).eq("id", logId);
      }

      localStorage.setItem("ptp_result", JSON.stringify(data));
      localStorage.setItem("ptp_prefs", JSON.stringify({ genre: selectedGenre, energy: selectedEnergy }));
      router.push("/result");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류가 발생했어요. 다시 시도해주세요.";
      // fetch 자체가 throw된 네트워크 오류 케이스 — 이때는 위 !res.ok 로깅이 안 탔으므로 여기서 보정
      if (logId && (e instanceof TypeError || /fetch|network|failed to fetch/i.test(msg))) {
        try {
          await supabase.from("analyze_logs").update({
            status: "fail",
            response_time_ms: Date.now() - startTime,
            error_reason: msg,
            error_code: "network_error",
          }).eq("id", logId);
        } catch { /* ignore */ }
      }
      setError(msg);
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
        <span style={{ fontSize: 20, visibility: "hidden" }}>←</span>
      </div>

      <p className="text-center mb-5" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
        정확한 추천을 위해 두 가지만 더 알려주세요
      </p>

      <div className="flex-1 flex flex-col px-5 overflow-y-auto">

        {/* 카드 1: 장르 */}
        <div className="mb-4 p-5" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
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
        <div className="mb-4 p-5" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <p className="mb-4 font-medium" style={{ fontSize: 13, color: "rgba(255,255,255,0.90)" }}>
            🎚️ 어떤 바이브로 듣고 싶어요?
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

        </div>

        <div className="flex-1" />

        {/* 오류 메시지 */}
        {error && (
          <p className="text-center mb-2" style={{ fontSize: 12, color: "#f0a0a0" }}>
            {error}
          </p>
        )}

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
            "분석 시작하기"
          )}
        </button>
        <p className="text-center mb-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
          10초면 오늘의 한 곡이 나와요
        </p>
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
              {(() => {
                const n = loadingPhotos.length;
                const sz = n === 1 ? 100 : n === 2 ? 88 : n === 3 ? 80 : n === 4 ? 72 : 64;
                const gap = n <= 3 ? 6 : 5;
                return (
                  <div style={{ display: "flex", gap, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
                    {loadingPhotos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        style={{
                          width: sz, height: sz,
                          objectFit: "cover",
                          borderRadius: 14,
                          border: "1.5px solid rgba(255,255,255,0.18)",
                          opacity: photosFadeIn ? 1.0 : 0.35,
                          transition: "opacity 2.6s ease",
                          flexShrink: 0,
                        }}
                      />
                    ))}
                    {loadingPhotos.length === 0 && (
                      <div style={{ width: 88, height: 88, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)" }} />
                    )}
                  </div>
                );
              })()}
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
              {(() => {
                const n = loadingPhotos.length;
                const sz = n === 1 ? 72 : n === 2 ? 64 : n === 3 ? 58 : n === 4 ? 52 : 46;
                const gap = n <= 3 ? 6 : 5;
                return (
                  <div style={{ display: "flex", gap, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                    {loadingPhotos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" style={{ width: sz, height: sz, objectFit: "cover", borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.14)", opacity: 0.65, flexShrink: 0 }} />
                    ))}
                    {loadingPhotos.length === 0 && (
                      <div style={{ width: 72, height: 72, borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
                    )}
                  </div>
                );
              })()}
              <p style={{ color: "#C4687A", fontSize: 13, marginBottom: 28, textAlign: "center", letterSpacing: "0.04em" }}>
                사진 속 오늘을 읽었어요 ✦
              </p>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
                {VIBE_AXES.map(({ left, right }, i) => (
                  <div key={left}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{left}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{right}</span>
                    </div>
                    <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                      {/* 중앙에서 양방향으로 채워지는 막대 */}
                      <div style={{
                        position: "absolute",
                        left: gaugeAnimated ? `${Math.min(50, gaugeTargets[i])}%` : "50%",
                        top: 0,
                        width: gaugeAnimated ? `${Math.abs(gaugeTargets[i] - 50)}%` : "0%",
                        height: "100%",
                        background: "#C4687A",
                        borderRadius: 3,
                        boxShadow: "0 0 8px rgba(196,104,122,0.5)",
                        transition: `left ${0.75 + i * 0.12}s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.1}s, width ${0.75 + i * 0.12}s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.1}s`,
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
              {(() => {
                const n = loadingPhotos.length;
                const sz = n === 1 ? 72 : n === 2 ? 64 : n === 3 ? 58 : n === 4 ? 52 : 46;
                const gap = n <= 3 ? 6 : 5;
                return (
                  <div style={{ display: "flex", gap, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
                    {loadingPhotos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" style={{ width: sz, height: sz, objectFit: "cover", borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.14)", opacity: 0.5, flexShrink: 0 }} />
                    ))}
                    {loadingPhotos.length === 0 && (
                      <div style={{ width: 72, height: 72, borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
                    )}
                  </div>
                );
              })()}
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
                      transition: "opacity 0.3s ease",
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
                {WAVE_BARS.map((bar, i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      borderRadius: 2,
                      background: "#C4687A",
                      animation: `${bar.anim} ${bar.duration}s ease-in-out ${bar.delay}s infinite`,
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
        @keyframes wave1 { 0%, 100% { height: 6px; } 50% { height: 22px; } }
        @keyframes wave2 { 0%, 100% { height: 10px; } 50% { height: 32px; } }
        @keyframes wave3 { 0%, 100% { height: 4px; } 50% { height: 16px; } }
      `}</style>
    </div>
  );
}
