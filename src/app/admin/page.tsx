"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/lib/supabase";
import { ImportTextSection } from "./ImportTextSection";

type PhotoLog = { id: string; created_at: string; device_id?: string | null };
type PrefLog = { id: string; created_at: string; genre: string | null; energy: number | null; device_id?: string | null };
type AnalyzeLog = { id: string; created_at: string; status: string; response_time_ms: number | null; song: string | null; artist: string | null; device_id?: string | null; utm_source?: string | null };
type EntryRow = { id: string; date: string; song: string; artist: string; genre: string | null; device_id?: string | null };
type ListenLog = { id: string; created_at: string; device_id?: string | null };
type ViewLog  = { id: string; created_at: string; duration_seconds: number | null; exit_type: string | null; device_id?: string | null };
type LogRow = { id: string; created_at: string; device_id?: string | null; entry_id?: string | null };
type StorySaveLog = { id: string; created_at: string; device_id: string | null; entry_id: string | null; status: string; user_agent: string | null };
type SaveLog = { id: string; created_at: string; entry_id: string; device_id: string };
type PreviewLog = { id: string; created_at: string; device_id: string; song: string | null; artist: string | null; action: "played" | "completed" };
type AuthLog = { id: string; created_at: string; device_id: string | null; user_id: string | null; event: string; metadata: Record<string, unknown> | null };
type ItunesCacheRow = { status: string | null };

// 내부 테스트 기기 목록 (콤마 구분). 대시보드에서 유저/테스트 데이터 구분용
const INTERNAL_DEVICE_IDS = new Set(
  (process.env.NEXT_PUBLIC_INTERNAL_DEVICE_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);
type SpotifyStatus = {
  status: "ok" | "rate_limited" | "token_failed";
  checkedAt: number;
  retryAfter: number | null;
};


// IMPORT_GENRES는 ./ImportTextSection.tsx로 이동 (곡 추가 섹션 전용)

function getTodayKST() {
  const kst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return kst.replace(/\.\s*/g, "-").replace(/-$/, "").trim();
}

function timestampToKSTShort(ts: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function timestampToKSTDate(ts: string): string {
  const d = new Date(ts);
  const kst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return kst.replace(/\.\s*/g, "-").replace(/-$/, "").trim();
}

// DB에 저장된 genre 값 → 표시명 매핑
const GENRE_KEYS = ["discover", "kpop", "pop", "hiphop", "indie", "rnb", "acoustic_jazz"];
const GENRE_LABEL: Record<string, string> = {
  discover: "장르 발견하기",
  kpop: "K-POP",
  pop: "팝",
  hiphop: "힙합",
  indie: "인디",
  rnb: "R&B/소울",
  acoustic_jazz: "어쿠스틱/재즈",
};
const ENERGY_LABELS = ["잔잔함", "여유", "설렘", "신남", "파워풀"];

function countBy(arr: string[]): [string, number][] {
  const map: Record<string, number> = {};
  for (const k of arr) {
    if (k) map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}


function pct(a: number, b: number): string {
  if (b === 0) return "—";
  return ((a / b) * 100).toFixed(1) + "%";
}

const C = {
  green:  "#6be0a0",
  yellow: "#f0d080",
  red:    "#f07070",
  gray:   "rgba(255,255,255,0.38)",
  white:  "rgba(255,255,255,0.75)",
};

// pctStr이 "—"이면 gray, 아니면 임계값 기반으로 green/yellow/red 반환
function accentByRate(pctStr: string, greenMin: number, yellowMin: number): string {
  if (pctStr === "—") return C.gray;
  const v = parseFloat(pctStr);
  if (isNaN(v)) return C.gray;
  if (v >= greenMin) return C.green;
  if (v >= yellowMin) return C.yellow;
  return C.red;
}

function useCountdown(targetMs: number | null): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!targetMs) { setRemaining(""); return; }
    const tick = () => {
      const diff = Math.max(0, targetMs - Date.now());
      if (diff === 0) { setRemaining("곧 초기화"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}시간 ${m}분 ${s}초` : `${m}분 ${s}초`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}

/**
 * Spotify 429 카운트다운 — 매초 setRemaining이 부모 page.tsx 리렌더로 전파되지 않도록
 * memo로 격리. spotifyStatus props 변경 시에만 리렌더.
 */
const SpotifyCountdown = memo(function SpotifyCountdown({
  spotifyStatus,
}: {
  spotifyStatus: SpotifyStatus | null;
}) {
  const retryTargetMs =
    spotifyStatus?.status === "rate_limited" && spotifyStatus.retryAfter
      ? spotifyStatus.checkedAt + spotifyStatus.retryAfter * 1000
      : null;
  const countdown = useCountdown(retryTargetMs);
  if (spotifyStatus?.status !== "rate_limited" || !countdown) return null;
  return <p style={{ fontSize: 12, color: "#f07070", margin: 0 }}>초기화까지 {countdown}</p>;
});

function ConvCard({
  label, value, sub, accent = "#C4687A", tooltip, avg7d,
}: {
  label: string; value: string; sub?: string; accent?: string; tooltip?: string;
  avg7d?: { value: string; delta?: "up" | "down" | "flat" | null };
}) {
  const deltaColor = avg7d?.delta === "up" ? "#6be0a0" : avg7d?.delta === "down" ? "#f07070" : "rgba(255,255,255,0.4)";
  const deltaArrow = avg7d?.delta === "up" ? "▲" : avg7d?.delta === "down" ? "▼" : "·";
  return (
    <div title={tooltip} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 18px", cursor: tooltip ? "help" : undefined }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 6 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1.1, display: "block" }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginTop: 4, display: "block" }}>{sub}</span>}
      {avg7d && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, display: "block" }}>
          최근 7일 평균 <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{avg7d.value}</span>
          {avg7d.delta && <span style={{ color: deltaColor, marginLeft: 6 }}>{deltaArrow}</span>}
        </span>
      )}
    </div>
  );
}

function RankList({
  title, items, accent = "#C4687A",
}: {
  title: string; items: [string, number][]; accent?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = items.filter(([, c]) => c > 0);
  const hidden  = items.filter(([, c]) => c === 0);
  const shown   = expanded ? items : visible;

  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>데이터 없음</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shown.map(([name, count], i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 && count > 0 ? accent : "rgba(255,255,255,0.3)", width: 18, flexShrink: 0, textAlign: "right" }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: count === 0 ? "rgba(255,255,255,0.35)" : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </div>
                  <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (count / (items[0][1] || 1)) * 100)}%`, background: i === 0 && count > 0 ? accent : "rgba(255,255,255,0.25)", borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ fontSize: 12, color: count === 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)", flexShrink: 0 }}>{count}회</span>
              </div>
            ))}
          </div>
          {hidden.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ marginTop: 10, background: "none", border: "none", padding: 0, fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}
            >
              {expanded ? "▲ 접기" : `+${hidden.length}개 더보기 ▼`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function FunnelStep({
  icon, label, count, conv, isLast, userCount, emphasis = "normal",
}: {
  icon: string; label: string; count: number; conv?: string; isLast?: boolean; userCount?: number;
  emphasis?: "strong" | "normal" | "weak";
}) {
  // 배경색은 모든 스텝 통일 (emphasis 차이는 label/arrow 색에만 반영)
  const bgAlpha  = 0.055;
  const labelColor = emphasis === "weak" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.85)";
  // 화살표 색: strong이어도 pink 유지 (전환율 숫자는 중립 의미). weak만 회색으로 톤다운
  const arrowColor = emphasis === "weak" ? "rgba(255,255,255,0.35)" : "#C4687A";
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 16px",
        background: `rgba(255,255,255,${bgAlpha})`,
        borderRadius: 12,
      }}>
        <span style={{ fontSize: 15, width: 22, textAlign: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, color: labelColor }}>{label}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: emphasis === "weak" ? "rgba(255,255,255,0.6)" : "#fff", lineHeight: 1.1 }}>{count.toLocaleString()}회</span>
          {userCount != null && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>유저 {userCount.toLocaleString()}명</span>
          )}
        </div>
      </div>
      {!isLast && (
        <div style={{ display: "flex", alignItems: "center", padding: "2px 0 2px 26px", gap: 8 }}>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          {conv && conv !== "—" && (
            <span style={{ fontSize: 11, color: arrowColor, fontWeight: 500 }}>↓ {conv}</span>
          )}
          {conv === "—" && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>↓</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [pw, setPw] = useState("");
  const [toast, setToast] = useState("");

  // 페이지 로드 시 기존 세션 쿠키 유효성 확인
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/auth", { method: "GET", credentials: "same-origin" })
      .then(res => {
        if (cancelled) return;
        if (res.ok) setAuthed(true);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, []);
  const [tab, setTab] = useState<"today" | "yesterday" | "all" | "custom">("today");
  const [viewMode, setViewMode] = useState<"user" | "test">("user");

  // viewMode localStorage 복원/저장
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("admin_view_mode") : null;
    if (saved === "user" || saved === "test") setViewMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("admin_view_mode", viewMode);
  }, [viewMode]);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd,   setCustomEnd]   = useState<string>("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);

  const [photoLogs, setPhotoLogs] = useState<PhotoLog[]>([]);
  const [prefLogs, setPrefLogs] = useState<PrefLog[]>([]);
  const [analyzeLogs, setAnalyzeLogs] = useState<AnalyzeLog[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [shareLogs, setShareLogs] = useState<LogRow[]>([]);
  const [listenLogs, setListenLogs] = useState<ListenLog[]>([]);
  const [viewLogs, setViewLogs] = useState<ViewLog[]>([]);
  const [shareViews, setShareViews] = useState<LogRow[]>([]);
  const [tryClicks, setTryClicks] = useState<LogRow[]>([]);
  const [saveLogs, setSaveLogs] = useState<SaveLog[]>([]);
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[]>([]);
  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);
  const [itunesCache, setItunesCache] = useState<ItunesCacheRow[]>([]);
  const [storySaveLogs, setStorySaveLogs] = useState<StorySaveLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [spotifyChecking, setSpotifyChecking] = useState(false);

  // 추천 품질 metrics (Catalog Coverage + Long-tail share)
  type QualityMetrics = {
    pool_size: number;
    period_30d: {
      total_recs: number;
      unique_songs_recommended: number;
      coverage_pct: number;
      top10_share_pct: number;
      top50_share_pct: number;
      long_tail_share_pct: number;
      max_single_song: number;
      one_off_songs: number;
      one_off_pct: number;
    };
    period_7d: {
      total_recs: number;
      unique_songs_recommended: number;
      max_single_song: number;
      top10_share_pct: number;
    };
  };
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  // ── 텍스트로 곡 추가 state는 ./ImportTextSection.tsx 내부로 이전 (타이핑 지연 해결) ──

  // Spotify 429 카운트다운은 <SpotifyCountdown />으로 분리 (매초 리렌더 격리)

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [photoRes, prefRes, entriesRes, listenRes, viewRes, logRowsRes, saveRes] = await Promise.all([
      supabase.from("photo_upload_logs").select("id, created_at, device_id").order("created_at", { ascending: false }),
      supabase.from("preference_logs").select("id, created_at, genre, energy, device_id").order("created_at", { ascending: false }),
      supabase.from("entries").select("id, date, song, artist, genre, device_id").order("id", { ascending: false }),
      supabase.from("listen_logs").select("id, created_at, device_id").order("created_at", { ascending: false }),
      supabase.from("result_view_logs").select("id, created_at, duration_seconds, exit_type, device_id").order("created_at", { ascending: false }),
      // RLS 켜진 테이블 — supabaseAdmin 경유 서버 API 사용 (share_views, try_click, itunes, story_save_logs, share_logs, preview_logs, auth_logs, analyze_logs)
      fetch("/api/admin/log-rows", { credentials: "same-origin" }).then(r => r.json()) as Promise<{ shareViews: LogRow[]; tryClicks: LogRow[]; itunes: ItunesCacheRow[]; storySaveLogs: StorySaveLog[]; shareLogs: LogRow[]; previewLogs: PreviewLog[]; authLogs: AuthLog[]; analyzeLogs: AnalyzeLog[] }>,
      supabase.from("save_logs").select("id, created_at, entry_id, device_id").order("created_at", { ascending: false }),
    ]);

    if (!photoRes.error) setPhotoLogs(photoRes.data ?? []);
    if (!prefRes.error) setPrefLogs(prefRes.data ?? []);
    if (entriesRes.error) showToast("entries 로드 실패");
    else setEntries(entriesRes.data ?? []);
    if (!listenRes.error) setListenLogs(listenRes.data ?? []);
    if (!viewRes.error) setViewLogs(viewRes.data ?? []);
    else console.error("[admin] result_view_logs 로드 실패:", viewRes.error.message);
    setShareViews(logRowsRes.shareViews ?? []);
    setTryClicks(logRowsRes.tryClicks ?? []);
    setItunesCache(logRowsRes.itunes ?? []);
    setStorySaveLogs(logRowsRes.storySaveLogs ?? []);
    setShareLogs(logRowsRes.shareLogs ?? []);
    setPreviewLogs(logRowsRes.previewLogs ?? []);
    setAuthLogs(logRowsRes.authLogs ?? []);
    setAnalyzeLogs(logRowsRes.analyzeLogs ?? []);
    if (!saveRes.error) setSaveLogs(saveRes.data ?? []);
    else console.error("[admin] save_logs 로드 실패:", saveRes.error.message);

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  const checkSpotify = useCallback(async () => {
    setSpotifyChecking(true);
    try {
      const res = await fetch("/api/admin/spotify-status", { credentials: "same-origin" });
      const data = await res.json();
      setSpotifyStatus(data);
    } catch {
      setSpotifyStatus({ status: "token_failed", checkedAt: Date.now(), retryAfter: null });
    } finally {
      setSpotifyChecking(false);
    }
  }, []);

  // 추천 품질 metric fetch (Catalog Coverage + Long-tail share)
  const fetchQualityMetrics = useCallback(async () => {
    setQualityLoading(true);
    try {
      const res = await fetch("/api/admin/quality-metrics", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setQualityMetrics(data);
      }
    } catch (e) {
      console.error("[admin] quality-metrics 로드 실패:", e);
    } finally {
      setQualityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchData();
    }
  }, [authed, fetchData]);

  // handleTextImport는 ./ImportTextSection.tsx 내부로 이전 (타이핑 지연 해결)

  const [loggingIn, setLoggingIn] = useState(false);
  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        setAuthed(true);
        setPw("");
      } else if (res.status === 401) {
        showToast("비밀번호가 틀렸어요");
        setPw("");
      } else {
        showToast("로그인에 실패했어요. 잠시 후 다시 시도해주세요");
        setPw("");
      }
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setLoggingIn(false);
    }
  };

  // ── 세션 확인 중: 빈 화면 ──
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }} />
    );
  }

  // ── 비밀번호 화면 ──
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
          <p style={{ color: "#C4687A", fontSize: 13, letterSpacing: "0.15em", marginBottom: 28 }}>Play the Picture</p>
          <p style={{ color: "#fff", fontSize: 17, fontWeight: 600, marginBottom: 24 }}>관리자 대시보드</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="비밀번호 입력"
            style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
          />
          <button
            onClick={handleLogin}
            style={{ width: "100%", background: "#C4687A", border: "none", borderRadius: 24, padding: "13px 0", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            입장하기
          </button>
        </div>
        {toast && (
          <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, padding: "10px 20px", borderRadius: 24, whiteSpace: "nowrap" }}>
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ── 데이터 필터링 ──
  const today = getTodayKST();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d).replace(/\.\s*/g, "-").replace(/-$/, "").trim();
  })();

  // KST 날짜 + N일 오프셋 (코호트 계산용)
  const kstOffset = (kstDate: string, n: number): string => {
    const [y, m, d] = kstDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(dt).replace(/\.\s*/g, "-").replace(/-$/, "").trim();
  };
  const sevenDaysAgo = kstOffset(today, -7);
  // 기간 유효성 (custom 탭)
  const rangeValid      = tab === "custom" && !!customStart && !!customEnd && customStart <= customEnd;
  const rangeStartDate  = rangeValid ? customStart : "";
  const rangeEndDate    = rangeValid ? customEnd   : "";
  const rangeDayCount   = rangeValid
    ? Math.round((new Date(rangeEndDate).getTime() - new Date(rangeStartDate).getTime()) / 86400000) + 1
    : 0;

  // 단일 날짜 모드 (today / yesterday)
  const activeDate = tab === "today" ? today : tab === "yesterday" ? yesterday : null;

  // 범용 타임스탬프 필터
  const filterTs = (ts: string): boolean => {
    const d = timestampToKSTDate(ts);
    if (tab === "today")     return d === today;
    if (tab === "yesterday") return d === yesterday;
    if (tab === "custom")    return rangeValid ? (d >= rangeStartDate && d <= rangeEndDate) : false;
    return true; // "all"
  };
  // viewMode 기반 device_id 필터
  // - "user": 내부 테스트 기기 제외 (device_id NULL은 유저 데이터로 간주 = 포함)
  // - "test": 내부 테스트 기기만 포함
  const filterDevice = (row: { device_id?: string | null }): boolean => {
    if (INTERNAL_DEVICE_IDS.size === 0) return true; // env 미설정 시 전부 통과
    const did = row.device_id;
    if (viewMode === "user") return !did || !INTERNAL_DEVICE_IDS.has(did);
    return !!did && INTERNAL_DEVICE_IDS.has(did);
  };
  // entry_id → device_id 복구 맵 (share_logs.device_id가 NULL인 구버전 레코드 대응)
  const entryDeviceMap: Record<string, string | null | undefined> = {};
  for (const e of entries) entryDeviceMap[e.id] = e.device_id;
  const recoveredShareLogs = shareLogs.map(s => ({
    ...s,
    device_id: s.device_id ?? (s.entry_id ? entryDeviceMap[s.entry_id] ?? null : null),
  }));

  const filteredPhotos  = photoLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredPrefs   = prefLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredAnalyze = analyzeLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredSaveLogs = saveLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredShares  = recoveredShareLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredListens = listenLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredViews   = shareViews.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredTry     = tryClicks.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredResultViews = viewLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredStorySaves = storySaveLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  // AUTH 섹션은 prod 게이트 ON 시점(2026-05-12 18:30 KST = 09:30 UTC) 이후 데이터만 집계.
  // 그 전 데이터는 내부 테스트(검증 시나리오 1·2 등)라 통계에서 제외.
  const AUTH_PROD_START_UTC = new Date("2026-05-12T09:30:00Z").getTime();
  const filteredAuth = authLogs.filter(l =>
    filterTs(l.created_at)
    && filterDevice(l)
    && new Date(l.created_at).getTime() >= AUTH_PROD_START_UTC
  );

  // ── AUTH 섹션 metrics (Phase 1A funnel 측정) ──
  const authEventCount = (event: string) => filteredAuth.filter(l => l.event === event).length;
  const authEventDevices = (event: string) =>
    new Set(filteredAuth.filter(l => l.event === event).map(l => l.device_id).filter((d): d is string => !!d)).size;

  // 1. 게이트 완료율 — gate_shown 본 device 중 어떤 식으로든 가입/스킵으로 통과한 비율
  // 분자: signup_complete · guest_skip · anonymous_signin_success · *_login_success 중 하나라도 발생한 device
  // OAuth re-login (signup_complete 안 찍힘)도 게이트 통과로 인정 — kakao/google/apple_login_success 포함
  // 분모: gate_shown 본 device. 게이트 노출 자체는 client flag 의존이라 사진 업로드 대비 비교 불가.
  const gateShownDeviceCount = authEventDevices("gate_shown");
  const gateShownDeviceSet = new Set(
    filteredAuth.filter(l => l.event === "gate_shown").map(l => l.device_id).filter((d): d is string => !!d)
  );
  const GATE_RESOLUTION_EVENTS = [
    "signup_complete",
    "guest_skip",
    "anonymous_signin_success",
    "kakao_login_success",
    "google_login_success",
    "apple_login_success",
  ];
  const gateResolvedDeviceCount = new Set(
    filteredAuth
      .filter(l => GATE_RESOLUTION_EVENTS.includes(l.event))
      .map(l => l.device_id)
      .filter((d): d is string => !!d && gateShownDeviceSet.has(d))
  ).size;
  const gateCompletionRatePct = gateShownDeviceCount > 0 ? (gateResolvedDeviceCount / gateShownDeviceCount) * 100 : null;

  // 2. 가입 방식별 — 각 success 이벤트 device 단위
  const googleSignupDevices = authEventDevices("google_login_success");
  const appleSignupDevices = authEventDevices("apple_login_success");
  const kakaoSignupDevices = authEventDevices("kakao_login_success");
  const anonSignupDevices = authEventDevices("anonymous_signin_success");
  const totalSignupDevices =
    googleSignupDevices + appleSignupDevices + kakaoSignupDevices + anonSignupDevices;
  // dominantMethod: 최대값 픽 — kakao까지 비교
  const maxSignup = Math.max(
    anonSignupDevices,
    kakaoSignupDevices,
    googleSignupDevices,
    appleSignupDevices,
  );
  const dominantMethod =
    totalSignupDevices === 0 ? null :
    maxSignup === anonSignupDevices ? "비회원" :
    maxSignup === kakaoSignupDevices ? "카카오" :
    maxSignup === googleSignupDevices ? "Google" : "Apple";
  const dominantSharePct =
    totalSignupDevices === 0 || maxSignup === 0
      ? null
      : (maxSignup / totalSignupDevices) * 100;

  // 3. linkIdentity 사용률 — anon 가입자 중 Google 업그레이드 시도 비율
  const linkStartDevices = authEventDevices("identity_link_start");
  const linkRatePct = anonSignupDevices > 0 ? (linkStartDevices / anonSignupDevices) * 100 : null;

  // 4. 충돌 발생률 — linkIdentity 시도 중 conflict merge로 이어진 비율
  const accountMergedCount = authEventCount("account_merged");
  const conflictRatePct = linkStartDevices > 0 ? (accountMergedCount / linkStartDevices) * 100 : null;

  // 5. 닉네임 변경률 — 가입 완료 중 닉네임 변경 비율
  const signupCompleteDevices = authEventDevices("signup_complete");
  const nicknameChangedDevices = authEventDevices("nickname_changed");
  const nicknameChangeRatePct = signupCompleteDevices > 0 ? (nicknameChangedDevices / signupCompleteDevices) * 100 : null;

  // 6. 인증 에러 분류 — *_failed 이벤트 합산 + 분류
  const anonFailCount = authEventCount("anonymous_signin_failed");
  const linkFailCount = authEventCount("identity_link_failed");
  const mergeFailCount = filteredAuth.filter(l => l.event === "account_merged" && l.metadata && (l.metadata as Record<string, unknown>).failed === true).length;
  const totalAuthFailCount = anonFailCount + linkFailCount + mergeFailCount;

  // ── 퍼널 수치 ──
  const photoCount = filteredPhotos.length;
  const prefCount = filteredPrefs.length;
  const analyzeStartCount = filteredAnalyze.length; // 모든 analyze_log = 분석 시작 횟수
  const successCount = filteredAnalyze.filter(l => l.status === "success").length;
  const failCount = filteredAnalyze.filter(l => l.status === "fail").length;
  const saveCount = filteredSaveLogs.length;
  const listenCount = filteredListens.length;
  const shareCount = filteredShares.length;
  const viewCount = filteredViews.length;
  const tryCount = filteredTry.length;

  // ── 유저 수 (distinct device_id) ──
  const distinctSet = (arr: Array<{ device_id?: string | null }>) =>
    new Set(arr.map(x => x.device_id).filter((d): d is string => !!d));

  const photoUsers    = distinctSet(filteredPhotos).size;
  const analyzeUsers  = distinctSet(filteredAnalyze).size;
  const successUsers  = distinctSet(filteredAnalyze.filter(l => l.status === "success")).size;
  const failUsers     = distinctSet(filteredAnalyze.filter(l => l.status === "fail")).size;
  const saveUsers     = distinctSet(filteredSaveLogs).size;
  const listenUsers   = distinctSet(filteredListens).size;

  // 유저 기준 전환율
  const userSuccessRate  = pct(successUsers, analyzeUsers);
  const userSaveRate     = pct(saveUsers, successUsers);
  const userShareRate    = pct(filteredShares.length, successUsers); // share_logs는 device_id 없음 → 건수 기준
  const userListenRate   = pct(listenUsers, successUsers);

  // ── 미리듣기 funnel (5/3 도입) ──
  // preview_logs는 사용자 행동 단위. device 단위 distinct로 노이즈 제거 (같은 device 여러 곡 재생 시도 노이즈).
  const filteredPreviews = previewLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const playedDevices = new Set(filteredPreviews.filter(l => l.action === "played").map(l => l.device_id).filter((d): d is string => !!d));
  const completedDevices = new Set(filteredPreviews.filter(l => l.action === "completed").map(l => l.device_id).filter((d): d is string => !!d));
  const previewPlayedUsers = playedDevices.size;
  const previewCompletedUsers = completedDevices.size;
  // 미리듣기 재생률 = 재생 유저 / 분석 성공 유저
  const previewPlayRate = pct(previewPlayedUsers, successUsers);
  // 30초 완료율 = 완료 유저 / 재생 유저 (재생 안 한 유저는 분모에서 제외)
  const previewCompleteRate = pct(previewCompletedUsers, previewPlayedUsers);

  // 종합 듣기 만족도 = (미리듣기 OR 외부 앱 듣기 발생 유저) / 분석 성공 유저
  // listen_click 단일 지표는 미리듣기 도입 후 의미 변질 → 합집합으로 진짜 듣기 의도 측정
  const listenSatisfiedDevices = new Set<string>(playedDevices);
  for (const l of filteredListens) if (l.device_id) listenSatisfiedDevices.add(l.device_id);
  const listenSatisfiedUsers = listenSatisfiedDevices.size;
  const overallListenRate = pct(listenSatisfiedUsers, successUsers);

  // iTunes 매칭 성공률 — 곡 풀 인프라 측정 (low_score 54곡 fix 작업 baseline)
  const itunesMatchedRows = itunesCache.filter(c =>
    c.status === "matched" || c.status === "matched_by_duration" ||
    c.status === "matched_by_llm" || c.status === "manual"
  ).length;
  const itunesTotalRows = itunesCache.length;
  const itunesMatchRate = itunesTotalRows > 0 ? (itunesMatchedRows / itunesTotalRows) * 100 : null;

  // ── 3갈래 분기 + 헤비 유저 / 이탈률 ──
  // 분석 성공 유저가 듣기·저장·공유 셋 중 어디로 분기하는지
  const successDevices = new Set(filteredAnalyze.filter(l => l.status === "success").map(l => l.device_id).filter((d): d is string => !!d));
  const saveDevices = new Set(filteredSaveLogs.map(l => l.device_id).filter((d): d is string => !!d));
  const shareDevices = new Set(filteredShares.map(l => l.device_id).filter((d): d is string => !!d));
  // 스토리 저장 device (story_save_logs clicked 이상)
  const storySaveDevices = new Set(filteredStorySaves.map(l => l.device_id).filter((d): d is string => !!d));
  // 공유 갈래 = URL 공유 ∪ 스토리 저장 합집합 (둘 다 viral 행동)
  const shareOrStoryDevices = new Set([...shareDevices, ...storySaveDevices]);
  // 갈래별 진입률 (성공 유저 기준)
  const listenBranchUsers = Array.from(successDevices).filter(d => listenSatisfiedDevices.has(d)).length;
  const saveBranchUsers   = Array.from(successDevices).filter(d => saveDevices.has(d)).length;
  const shareBranchUsers  = Array.from(successDevices).filter(d => shareOrStoryDevices.has(d)).length;
  const listenBranchRate = pct(listenBranchUsers, successUsers);
  const saveBranchRate   = pct(saveBranchUsers, successUsers);
  const shareBranchRate  = pct(shareBranchUsers, successUsers);
  // 헤비 유저 = 3가지 다 한 유저
  const heavyUsers = Array.from(successDevices).filter(d =>
    listenSatisfiedDevices.has(d) && saveDevices.has(d) && shareDevices.has(d)
  ).length;
  const heavyUserRate = pct(heavyUsers, successUsers);
  // 이탈률 = 성공 유저 중 듣기·저장·공유 모두 안 한 비율
  const anyActionUsers = Array.from(successDevices).filter(d =>
    listenSatisfiedDevices.has(d) || saveDevices.has(d) || shareDevices.has(d)
  ).length;
  const dropoffUsers = successUsers - anyActionUsers;
  const dropoffRate = pct(dropoffUsers, successUsers);

  // 유저당 평균 분석 횟수 — 성공 유저 기준 (성공 건수 ÷ 성공 유저 수)
  const avgAnalysesPerUser = successUsers > 0 ? (successCount / successUsers).toFixed(1) : "—";

  // 유저별 성공 분석 횟수 분포 — 중앙값/최대값 (극단치 감지용)
  const perUserSuccessCounts = (() => {
    const counts: Record<string, number> = {};
    for (const l of filteredAnalyze) {
      if (l.status !== "success" || !l.device_id) continue;
      counts[l.device_id] = (counts[l.device_id] ?? 0) + 1;
    }
    return Object.values(counts).sort((a, b) => a - b);
  })();
  const medianAnalysesPerUser = perUserSuccessCounts.length > 0
    ? (() => {
        const n = perUserSuccessCounts.length;
        const mid = Math.floor(n / 2);
        return n % 2 === 0
          ? ((perUserSuccessCounts[mid - 1] + perUserSuccessCounts[mid]) / 2).toFixed(1)
          : perUserSuccessCounts[mid].toString();
      })()
    : "—";
  const maxAnalysesPerUser = perUserSuccessCounts.length > 0
    ? perUserSuccessCounts[perUserSuccessCounts.length - 1]
    : 0;

  // ── 회차별 분석 (1회차/2회차/3회차/4회+) ──
  // 각 device의 성공 분석을 시간순으로 정렬 → attempt N의 구간 [T_N, T_{N+1})에
  // save_log / share_log가 있는지 체크
  type AttemptBucket = { saved: number; shared: number; attempts: number };
  const attemptBuckets: Record<string, AttemptBucket> = {
    "1": { saved: 0, shared: 0, attempts: 0 },
    "2": { saved: 0, shared: 0, attempts: 0 },
    "3": { saved: 0, shared: 0, attempts: 0 },
    "4+": { saved: 0, shared: 0, attempts: 0 },
  };
  const retryGapsSec: number[] = [];

  // device별 success analyze 시간 정렬
  const successByDevice: Record<string, number[]> = {};
  for (const l of filteredAnalyze) {
    if (l.status !== "success" || !l.device_id) continue;
    const t = new Date(l.created_at).getTime();
    (successByDevice[l.device_id] ??= []).push(t);
  }
  for (const times of Object.values(successByDevice)) times.sort((a, b) => a - b);

  // device별 save/share 시간
  const savesByDevice: Record<string, number[]> = {};
  for (const l of filteredSaveLogs) {
    if (!l.device_id) continue;
    (savesByDevice[l.device_id] ??= []).push(new Date(l.created_at).getTime());
  }
  const sharesByDevice: Record<string, number[]> = {};
  for (const l of filteredShares) {
    if (!l.device_id) continue;
    (sharesByDevice[l.device_id] ??= []).push(new Date(l.created_at).getTime());
  }

  const bucketKey = (n: number) => n >= 4 ? "4+" : String(n);
  for (const [did, times] of Object.entries(successByDevice)) {
    const saves  = savesByDevice[did]  ?? [];
    const shares = sharesByDevice[did] ?? [];
    for (let i = 0; i < times.length; i++) {
      const start = times[i];
      const end   = i + 1 < times.length ? times[i + 1] : Infinity;
      const k = bucketKey(i + 1);
      attemptBuckets[k].attempts++;
      if (saves.some(t => t >= start && t < end))  attemptBuckets[k].saved++;
      if (shares.some(t => t >= start && t < end)) attemptBuckets[k].shared++;
      // 재뽑기 텀
      if (end !== Infinity) retryGapsSec.push((end - start) / 1000);
    }
  }

  // 1회차 저장율/공유율 (KEY METRICS용)
  const firstSaveRatePct = attemptBuckets["1"].attempts > 0
    ? (attemptBuckets["1"].saved  / attemptBuckets["1"].attempts) * 100
    : null;
  const firstShareRatePct = attemptBuckets["1"].attempts > 0
    ? (attemptBuckets["1"].shared / attemptBuckets["1"].attempts) * 100
    : null;

  // 재뽑기 텀 분포 버킷
  const retryGapBuckets = [
    { label: "27–45초",    min: 0,    max: 45 },
    { label: "45–90초",    min: 45,   max: 90 },
    { label: "90초–5분",   min: 90,   max: 300 },
    { label: "5분–1시간",  min: 300,  max: 3600 },
    { label: "1시간+",     min: 3600, max: Infinity },
  ].map(b => ({
    ...b,
    count: retryGapsSec.filter(g => g >= b.min && g < b.max).length,
  }));
  const retryGapTotal = retryGapsSec.length;

  // ── VIRAL LOOP ──
  const viewPerShare = shareCount > 0 ? (viewCount / shareCount) : null;
  const tryPerShare  = shareCount > 0 ? (tryCount  / shareCount) : null;
  const inflowConvRate = viewCount > 0 ? (tryCount / viewCount) * 100 : null;

  // ── viral 정확도 측정 (5/3 도입) ──
  // share_views의 raw count는 자가 view + 동일 친구 다회 클릭 노이즈 포함.
  // entry별 sharer device를 기준으로 "외부 unique 친구 도달"과 "자가 view 비중" 분리.
  const sharerByEntry = new Map<string, string>();
  for (const s of filteredShares) {
    if (s.entry_id && s.device_id) sharerByEntry.set(s.entry_id, s.device_id);
  }
  let selfViewCount = 0;
  let externalViewCount = 0;
  let unmatchedViewCount = 0; // sharer 매핑 없는 viewer (옛 share·share_logs 누락 등) — viral 측정에서 제외
  const externalViewersByEntry = new Map<string, Set<string>>();
  for (const v of filteredViews) {
    if (!v.entry_id || !v.device_id) continue;
    const sharer = sharerByEntry.get(v.entry_id);
    if (sharer && v.device_id === sharer) {
      selfViewCount++;
    } else if (sharer) {
      // sharer 매핑 있고 본인이 아님 = 진짜 외부 친구 도달
      externalViewCount++;
      const set = externalViewersByEntry.get(v.entry_id) ?? new Set<string>();
      set.add(v.device_id);
      externalViewersByEntry.set(v.entry_id, set);
    } else {
      // sharer 매핑 없음 (옛 share·INSERT 누락 등) — viral chain 측정에서 분리
      unmatchedViewCount++;
    }
  }
  // 공유 1건당 unique 친구 도달 — 진짜 viral coefficient에 가까운 측정
  const uniqueFriendReach = Array.from(externalViewersByEntry.values())
    .reduce((sum, viewers) => sum + viewers.size, 0);
  const uniqueReachPerShare = shareCount > 0 ? (uniqueFriendReach / shareCount) : null;
  // 자가 view 비중 — raw view 지표의 신뢰도 측정
  const totalViewsForRatio = selfViewCount + externalViewCount;
  const selfViewRatio = totalViewsForRatio > 0 ? (selfViewCount / totalViewsForRatio) * 100 : null;

  // ── 스토리 저장 funnel (story_save_logs) ──
  // funnel: clicked → generated → shared / cancelled / downloaded / failed
  // 상태가 PATCH로 진행되어 row 1개가 최종 status까지 도달 (share_logs 패턴 동일)
  const storyClickedCount   = filteredStorySaves.length; // 모든 row = clicked부터 시작
  const storyGeneratedCount = filteredStorySaves.filter(l => ["generated", "shared", "cancelled", "downloaded"].includes(l.status)).length;
  const storySharedCount    = filteredStorySaves.filter(l => l.status === "shared").length;
  const storyDownloadedCount = filteredStorySaves.filter(l => l.status === "downloaded").length;
  const storyCancelledCount = filteredStorySaves.filter(l => l.status === "cancelled").length;
  const storyFailedCount    = filteredStorySaves.filter(l => l.status === "failed").length;
  // 환경별 분류 (UA) — 인스타 인앱 vs 외부 비교 (광고 ROAS 시너지 신호)
  const classifyStoryUA = (ua: string | null): string => {
    if (!ua) return "null_ua";
    if (/KAKAOTALK/i.test(ua)) return "kakao_inapp";
    // Instagram 인앱은 OS 분리 — 안드로이드는 navigator.share/download 차단되어 viral 동선 X
    if (/Instagram/i.test(ua)) {
      if (/Android/.test(ua)) return "android_instagram_inapp";
      if (/iPhone|iPad/.test(ua)) return "ios_instagram_inapp";
      return "instagram_inapp_other";
    }
    if (/FBAN|FBAV/i.test(ua)) return "fb_inapp";
    if (/; wv\)/.test(ua)) return "android_webview";
    if (/CriOS/.test(ua)) return "ios_chrome";
    if (/iPhone|iPad/.test(ua)) return "ios_safari";
    if (/Macintosh/.test(ua)) return "mac_desktop";
    if (/Windows/.test(ua)) return "win_desktop";
    if (/Android/.test(ua)) return "android_chrome";
    return "other";
  };
  const storyEnvCounts: Record<string, number> = {};
  for (const l of filteredStorySaves) {
    const env = classifyStoryUA(l.user_agent);
    storyEnvCounts[env] = (storyEnvCounts[env] ?? 0) + 1;
  }
  const storyAndroidInstaRate = storyClickedCount > 0 ? pct(storyEnvCounts["android_instagram_inapp"] ?? 0, storyClickedCount) : "—";
  const storyIosInstaRate     = storyClickedCount > 0 ? pct(storyEnvCounts["ios_instagram_inapp"] ?? 0, storyClickedCount) : "—";
  const storyIosSafariRate    = storyClickedCount > 0 ? pct(storyEnvCounts["ios_safari"] ?? 0, storyClickedCount) : "—";

  // K-factor (단순화): 성공 유저 1명당 만들어낸 "나도 해보기 클릭" 수
  // = 공유율 × 공유당 유입률
  const kFactor = successUsers > 0 ? (tryCount / successUsers) : null;

  // ── 최근 7일 평균 (탭과 무관하게 항상 today-7 ~ today-1 구간) ──
  // 하루 편차가 큰 KEY METRICS의 벤치마크로 사용
  const last7Start = kstOffset(today, -7); // today 기준 -7일 (포함)
  const in7Days = (ts: string): boolean => {
    const d = timestampToKSTDate(ts);
    return d >= last7Start && d < today; // 어제까지 7일간 (오늘 제외)
  };
  const last7Analyze = analyzeLogs.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7Saves   = saveLogs.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7Shares  = recoveredShareLogs.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7Views   = shareViews.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7Try     = tryClicks.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7SuccessUsers = distinctSet(last7Analyze.filter(l => l.status === "success")).size;
  // 5/10 — last7ShareRate/InflowRate 제거 (KEY METRICS 재정의로 미사용)
  const last7KFactor    = last7SuccessUsers > 0 ? (last7Try.length / last7SuccessUsers) : null;

  // ── KEY METRICS — viral 행동률 (URL 공유 ∪ 스토리 저장) ──
  // 5/10 추가 — 기존 "공유율(URL only)"이 7.7% conversion인 스토리 outcome을 빼고 측정해
  // viral 약화 신호 못 잡음. shareBranchUsers는 합집합 정의 (line 622) — KEY로 승격.
  const viralActionRate = pct(shareBranchUsers, successUsers);
  // last7 평균 (벤치마크용)
  const last7StorySaves = storySaveLogs.filter(l => in7Days(l.created_at) && filterDevice(l));
  const last7ShareDevices = new Set(last7Shares.map(l => l.device_id).filter((d): d is string => !!d));
  const last7StoryDevices = new Set(last7StorySaves.map(l => l.device_id).filter((d): d is string => !!d));
  const last7ViralActionUsers = new Set([...last7ShareDevices, ...last7StoryDevices]).size;
  const last7ViralActionRate = last7SuccessUsers > 0 ? (last7ViralActionUsers / last7SuccessUsers) * 100 : null;

  // ── KEY METRICS — organic 유입 비중 (cohort viral health) ──
  // 5/10 추가 — direct attribution은 본질적 한계가 있어 cohort 측정으로 대체.
  // 신규 device의 첫 분석 utm_source가 NULL이면 organic (광고 외 = viral + 검색 + 즐겨찾기).
  // analyze_logs 전체에서 device의 첫 등장 시 utm 기준.
  const deviceFirstUtm = (() => {
    const map: Record<string, { first: number; utm: string | null }> = {};
    for (const l of analyzeLogs) {
      if (!l.device_id) continue;
      const t = new Date(l.created_at).getTime();
      const cur = map[l.device_id];
      if (!cur || t < cur.first) {
        map[l.device_id] = { first: t, utm: l.utm_source ?? null };
      }
    }
    return map;
  })();
  // 현재 기간 내 첫 등장 device (= 신규 device)
  const periodNewDevices = new Set<string>();
  for (const [dev, info] of Object.entries(deviceFirstUtm)) {
    if (filterTs(new Date(info.first).toISOString()) && filterDevice({ device_id: dev })) {
      periodNewDevices.add(dev);
    }
  }
  const periodNewCount = periodNewDevices.size;
  // 5/11 정의 통일 — cohort chart와 동일하게 (utm null + ig + instagram) 합집합
  // ig·instagram은 viral 신호 (Meta 광고는 utm=meta로 명확히 박힘)
  const isOrganicUtm = (utm: string | null | undefined) => !utm || utm === "ig" || utm === "instagram";
  const periodOrganicCount = Array.from(periodNewDevices).filter(d => isOrganicUtm(deviceFirstUtm[d]?.utm)).length;
  const organicRatePct = periodNewCount > 0 ? (periodOrganicCount / periodNewCount) * 100 : null;
  // last7 organic 비중
  const last7NewDevices = new Set<string>();
  for (const [dev, info] of Object.entries(deviceFirstUtm)) {
    if (in7Days(new Date(info.first).toISOString()) && filterDevice({ device_id: dev })) {
      last7NewDevices.add(dev);
    }
  }
  const last7NewCount = last7NewDevices.size;
  const last7OrganicCount = Array.from(last7NewDevices).filter(d => isOrganicUtm(deviceFirstUtm[d]?.utm)).length;
  const last7OrganicRate = last7NewCount > 0 ? (last7OrganicCount / last7NewCount) * 100 : null;

  // ── 📷 스토리 viral 시도율 (Card A) ──
  // (story shared+downloaded device count) / successUsers
  // 5/3-5/10 baseline: median 12% / range 6.7%-24.6% (8일치 검증) — 임계값 ≥15/≥10
  const storyOutcomeDevices = new Set(
    filteredStorySaves
      .filter(l => l.status === "shared" || l.status === "downloaded")
      .map(l => l.device_id)
      .filter((d): d is string => !!d)
  );
  const storyViralUsers = Array.from(successDevices).filter(d => storyOutcomeDevices.has(d)).length;
  const storyViralRate = pct(storyViralUsers, successUsers);
  const last7StoryOutcomeDevices = new Set(
    last7StorySaves
      .filter(l => l.status === "shared" || l.status === "downloaded")
      .map(l => l.device_id)
      .filter((d): d is string => !!d)
  );
  const last7StoryViralRate = last7SuccessUsers > 0 ? (last7StoryOutcomeDevices.size / last7SuccessUsers) * 100 : null;

  // ── 📷 스토리 viral 효율 (Card B) ──
  // outcome / total attempts (clicked 포함 모든 row)
  // 5/3-5/10 baseline: median 50% / range 30%-77% — 임계값 ≥60/≥40
  const storyAttempts = filteredStorySaves.length;
  const storyOutcomes = filteredStorySaves.filter(l => l.status === "shared" || l.status === "downloaded").length;
  const storyEfficiencyPct = storyAttempts > 0 ? (storyOutcomes / storyAttempts) * 100 : null;
  const last7StoryAttempts = last7StorySaves.length;
  const last7StoryOutcomes = last7StorySaves.filter(l => l.status === "shared" || l.status === "downloaded").length;
  const last7StoryEfficiency = last7StoryAttempts > 0 ? (last7StoryOutcomes / last7StoryAttempts) * 100 : null;

  // ── 📈 유입 cohort 7일 일별 (Mini chart 옵션 X — 광고 vs organic 누적) ──
  // 마지막 7일 (오늘 포함). 각 day 신규 device의 첫 utm으로 분류.
  const cohort7dDays: { date: string; meta: number; organic: number; total: number }[] = (() => {
    const result: { date: string; meta: number; organic: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = kstOffset(today, -i);
      const dateStr = d;
      const newDevsOnDay = Object.entries(deviceFirstUtm).filter(([dev, info]) => {
        if (!filterDevice({ device_id: dev })) return false;
        const dateOfFirst = timestampToKSTDate(new Date(info.first).toISOString());
        return dateOfFirst === dateStr;
      });
      const meta = newDevsOnDay.filter(([, info]) => info.utm === "meta").length;
      const organic = newDevsOnDay.filter(([, info]) => !info.utm || info.utm === "ig" || info.utm === "instagram").length;
      result.push({ date: dateStr, meta, organic, total: newDevsOnDay.length });
    }
    return result;
  })();
  const cohort7dMax = Math.max(1, ...cohort7dDays.map(d => d.total));

  // 7일 1회차 저장율: 각 device의 첫 성공 → 두 번째 성공 전까지 구간에 save 있는지
  const last7SuccessByDevice: Record<string, number[]> = {};
  for (const l of last7Analyze) {
    if (l.status !== "success" || !l.device_id) continue;
    (last7SuccessByDevice[l.device_id] ??= []).push(new Date(l.created_at).getTime());
  }
  for (const t of Object.values(last7SuccessByDevice)) t.sort((a, b) => a - b);
  const last7SavesByDevice: Record<string, number[]> = {};
  for (const l of last7Saves) {
    if (!l.device_id) continue;
    (last7SavesByDevice[l.device_id] ??= []).push(new Date(l.created_at).getTime());
  }
  let last7FirstAttempts = 0, last7FirstSaves = 0;
  for (const [did, times] of Object.entries(last7SuccessByDevice)) {
    last7FirstAttempts++;
    const start = times[0];
    const end = times.length > 1 ? times[1] : Infinity;
    const saves = last7SavesByDevice[did] ?? [];
    if (saves.some(t => t >= start && t < end)) last7FirstSaves++;
  }
  const last7FirstSaveRate = last7FirstAttempts > 0 ? (last7FirstSaves / last7FirstAttempts) * 100 : null;

  // ── USERS 섹션 ──
  // DAU: 기준일에 device_id가 있는 analyze_logs
  const dau = analyzeUsers;

  // 신규 / 재방문 (전체 데이터에서 첫 방문일 기준)
  const firstSeenMap: Record<string, string> = {};
  for (const log of analyzeLogs.filter(filterDevice)) {
    if (!log.device_id) continue;
    const d = timestampToKSTDate(log.created_at);
    if (!firstSeenMap[log.device_id] || d < firstSeenMap[log.device_id]) {
      firstSeenMap[log.device_id] = d;
    }
  }
  let newUsers = 0;
  let returnUsers = 0;
  if (activeDate) {
    for (const did of distinctSet(filteredAnalyze)) {
      if (firstSeenMap[did] === activeDate) newUsers++;
      else returnUsers++;
    }
  }
  // "전체" 탭일 때는 누적 유저 수만 표시
  const totalUniqueUsers = new Set(
    analyzeLogs.filter(filterDevice).map(l => l.device_id).filter((d): d is string => !!d)
  ).size;

  // ── 리텐션 계산 (analyze_logs 전체 기준, 항상 today 기준) ──
  // 날짜별 방문 device_id 집합
  const visitsByDate: Record<string, Set<string>> = {};
  for (const log of analyzeLogs.filter(filterDevice)) {
    if (!log.device_id) continue;
    const d = timestampToKSTDate(log.created_at);
    if (!visitsByDate[d]) visitsByDate[d] = new Set();
    visitsByDate[d].add(log.device_id);
  }
  const todayVisitors   = visitsByDate[today]      ?? new Set<string>();

  // D1 리텐션: 어제 신규 → 오늘 재방문
  const d1BaseDevices  = Object.entries(firstSeenMap).filter(([, fd]) => fd === yesterday).map(([id]) => id);
  const d1Returned     = d1BaseDevices.filter(id => todayVisitors.has(id)).length;
  const d1BaseCount    = d1BaseDevices.length;
  const d1Rate         = d1BaseCount >= 5 ? pct(d1Returned, d1BaseCount) : "—";
  // 5/10 변경 — D1 (20/10 → 7/3): 14일 max 7.6%, 1회성 도구 reality 반영
  const d1Accent       = d1BaseCount < 5  ? C.gray : accentByRate(d1Rate, 7, 3);

  // D7 리텐션: 7일 전 신규 → 오늘 재방문
  const d7BaseDevices  = Object.entries(firstSeenMap).filter(([, fd]) => fd === sevenDaysAgo).map(([id]) => id);
  const d7Returned     = d7BaseDevices.filter(id => todayVisitors.has(id)).length;
  const d7BaseCount    = d7BaseDevices.length;
  const d7Rate         = d7BaseCount >= 5 ? pct(d7Returned, d7BaseCount) : "—";
  // 5/10 변경 — D7 (10/5 → 3/1): 14일 max 2.9%, 1회성 도구 reality 반영
  const d7Accent       = d7BaseCount < 5  ? C.gray : accentByRate(d7Rate, 3, 1);

  // ── Lifetime 재방문 비율 (5/10 신규) ──
  // "처음 본 사람 중 한 번이라도 다시 온 비율" — 1회성 도구의 진짜 retention 신호.
  // 분모: 14-30일 전 신규 device (충분히 시간 지난 cohort, sample 안정성)
  // 분자: 그 중 first 이후 다른 날 재방문한 device
  // baseline (5/10 검증): 17일치 cohort median 8% / range 1.9-17.6%
  const lifetimeStart = kstOffset(today, -30);
  const lifetimeEnd   = kstOffset(today, -14); // -14일까지 (오늘 - 14일 = 안정 기준)
  const lifetimeBaseDevices = Object.entries(firstSeenMap)
    .filter(([, fd]) => fd >= lifetimeStart && fd < lifetimeEnd)
    .map(([id, fd]) => ({ id, fd }));
  const lifetimeReturned = lifetimeBaseDevices.filter(({ id, fd }) =>
    Object.entries(visitsByDate).some(([d, set]) => d > fd && set.has(id))
  ).length;
  const lifetimeBaseCount = lifetimeBaseDevices.length;
  const lifetimeRate = lifetimeBaseCount >= 30 ? pct(lifetimeReturned, lifetimeBaseCount) : "—";
  const lifetimeAccent = lifetimeBaseCount < 30 ? C.gray : accentByRate(lifetimeRate, 10, 5);

  // 평균 재방문 간격: 재방문한 유저 기준 (first vs latest)
  const multiVisitGaps: number[] = [];
  for (const [did, firstDate] of Object.entries(firstSeenMap)) {
    const dates = [...(visitsByDate[firstDate] ?? new Set())].length > 0
      ? Object.entries(visitsByDate)
          .filter(([, set]) => set.has(did))
          .map(([d]) => d)
          .sort()
      : [];
    if (dates.length >= 2) {
      const [fy, fm, fd2] = dates[0].split("-").map(Number);
      const [ly, lm, ld]  = dates[dates.length - 1].split("-").map(Number);
      const firstMs = Date.UTC(fy, fm - 1, fd2);
      const lastMs  = Date.UTC(ly, lm - 1, ld);
      multiVisitGaps.push((lastMs - firstMs) / 86400000);
    }
  }
  const avgRevisitDays = multiVisitGaps.length > 0
    ? (multiVisitGaps.reduce((s, v) => s + v, 0) / multiVisitGaps.length).toFixed(1)
    : null;

  // 코호트 테이블: 최근 7일 × D1/D3/D7
  const COHORT_DAYS = 7;
  const cohortDns   = [1, 3, 7] as const;
  const cohortRows  = Array.from({ length: COHORT_DAYS }, (_, i) => {
    const cohortDate = kstOffset(today, -(COHORT_DAYS - 1 - i)); // 오래된 날부터 → 최신 역순으로 나중에 reverse
    const newOnDate  = Object.entries(firstSeenMap).filter(([, fd]) => fd === cohortDate).map(([id]) => id);
    const newCount   = newOnDate.length;
    const dn = cohortDns.map(n => {
      const targetDate = kstOffset(cohortDate, n);
      if (targetDate > today) return null; // 아직 안 온 미래
      const returned = newOnDate.filter(id => (visitsByDate[targetDate] ?? new Set()).has(id)).length;
      return { returned, rate: newCount > 0 ? ((returned / newCount) * 100).toFixed(0) + "%" : "—" };
    });
    return { date: cohortDate, newCount, dn };
  }).reverse(); // 최신 날짜가 위

  // ── 퍼포먼스 ──
  const completedLogs = filteredAnalyze.filter(l => (l.status === "success" || l.status === "fail") && l.response_time_ms != null);
  const avgResponseMs = completedLogs.length > 0
    ? Math.round(completedLogs.reduce((sum, l) => sum + (l.response_time_ms ?? 0), 0) / completedLogs.length)
    : null;
  // 5/10 추가 — median/max 표시 (avg는 outlier에 흔들림, 분포 함께 보기)
  const responseTimesMs = completedLogs
    .map(l => l.response_time_ms ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const medianResponseMs = responseTimesMs.length > 0
    ? responseTimesMs[Math.floor(responseTimesMs.length / 2)]
    : null;
  const maxResponseMs = responseTimesMs.length > 0 ? responseTimesMs[responseTimesMs.length - 1] : null;
  const completedTotal = successCount + failCount;
  const failRatePct = completedTotal > 0 ? (failCount / completedTotal) * 100 : null;
  const failRateStr = failRatePct != null ? failRatePct.toFixed(1) + "%" : "—";

  // ── 색상 계산 ──
  // CONVERSION
  const convSuccessAccent = accentByRate(userSuccessRate, 95, 80);
  const convListenAccent  = accentByRate(userListenRate,  70, 50);
  const convSaveAccent    = successUsers >= 10 ? accentByRate(userSaveRate,  15,  5) : C.gray;
  const convShareAccent   = successUsers >= 10 ? accentByRate(userShareRate, 10,  3) : C.gray;
  // PERFORMANCE — 응답 시간 (5/10 변경: 8000/10000 → 11000/13000)
  // Claude API median 11s baseline 반영 — 14일 분포 median 11,300ms / range 10,777-12,637ms
  const perfResponseAccent = avgResponseMs == null ? C.gray
    : avgResponseMs <= 11000 ? C.green
    : avgResponseMs <= 13000 ? C.yellow
    : C.red;
  const perfFailAccent = failRatePct == null ? C.gray
    : failRatePct <= 5  ? C.green
    : failRatePct <= 15 ? C.yellow
    : C.red;

  // ── 체류 시간 계산 ──
  const rvTotal = filteredResultViews.length;
  const rvDurations = filteredResultViews
    .map(l => l.duration_seconds)
    .filter((d): d is number => d != null && d >= 0);
  const avgDuration = rvDurations.length > 0
    ? Math.round(rvDurations.reduce((s, d) => s + d, 0) / rvDurations.length)
    : null;
  const over30Pct  = rvTotal > 0 ? (filteredResultViews.filter(l => (l.duration_seconds ?? 0) >= 30).length / rvTotal * 100).toFixed(1) + "%" : "—";
  const under10Pct = rvTotal > 0 ? (filteredResultViews.filter(l => (l.duration_seconds ?? 0) < 10).length  / rvTotal * 100).toFixed(1) + "%" : "—";
  const avgDurationStr = avgDuration != null ? `${avgDuration}초` : "—";
  // 색상 (10건 미만이면 회색)
  const rvGray = rvTotal < 10;
  const perfAvgDurAccent  = rvGray ? C.gray : avgDuration == null ? C.gray : avgDuration >= 30 ? C.green : avgDuration >= 15 ? C.yellow : C.red;
  // 5/10 변경 — 30초+ 체류 (40/20 → 25/15): 14일 baseline median 19% / range 10-30%, green 0/14일 달성
  const perfOver30Accent  = rvGray ? C.gray : accentByRate(over30Pct,  25, 15);
  // 5/10 변경 — 10초- 이탈 (60/80 → 30/45): 14일 baseline median 36% / range 19.8-52%, 항상 green 의미 X
  const perfUnder10Accent = rvGray ? C.gray : (() => {
    if (under10Pct === "—") return C.gray;
    const v = parseFloat(under10Pct);
    return v <= 30 ? C.green : v <= 45 ? C.yellow : C.red;
  })();

  // ── 콘텐츠 인사이트 ──
  const topGenres: [string, number][] = GENRE_KEYS.map((key): [string, number] => [
    GENRE_LABEL[key] ?? key,
    filteredPrefs.filter(l => l.genre === key).length,
  ]).sort((a, b) => b[1] - a[1]);
  const topEnergy: [string, number][] = ENERGY_LABELS.map((label, idx): [string, number] => [
    label,
    filteredPrefs.filter(l => Number(l.energy) === idx + 1).length,
  ]).sort((a, b) => b[1] - a[1]);
  const topSongs = countBy(
    filteredAnalyze
      .filter(l => l.status === "success" && l.song)
      .map(l => `${l.song}${l.artist ? ` — ${l.artist}` : ""}`)
  ).slice(0, 5);
  const entryById: Record<string, EntryRow> = {};
  for (const e of entries) entryById[e.id] = e;
  const topSavedSongs = countBy(
    filteredSaveLogs
      .map(l => entryById[l.entry_id ?? ""])
      .filter((e): e is EntryRow => !!e && !!e.song)
      .map(e => `${e.song}${e.artist ? ` — ${e.artist}` : ""}`)
  ).slice(0, 5);

  // ── ① 공유된 곡 Top 5 (5/10: URL 공유 ∪ 스토리 outcome 합집합) ──
  // 기존엔 URL 공유만 카운트했지만 스토리 outcome 14배 큰 lever 빠짐 → 정정
  const sharedSongTitles = [
    ...filteredShares.map(l => entryById[l.entry_id ?? ""]),
    ...filteredStorySaves
      .filter(l => l.status === "shared" || l.status === "downloaded")
      .map(l => entryById[l.entry_id ?? ""]),
  ]
    .filter((e): e is EntryRow => !!e && !!e.song)
    .map(e => `${e.song}${e.artist ? ` — ${e.artist}` : ""}`);
  const topSharedSongs = countBy(sharedSongTitles).slice(0, 5);

  // ── ② 장르별 저장률 / 공유율 ──
  // 분모: preference_logs의 장르별 선택 수 (= 장르 선택 후 분석 시작한 유저 수 근사)
  // 분자: save_logs / share_logs → entries.genre 조인
  const genrePrefCount: Record<string, number> = {};
  for (const p of filteredPrefs) {
    if (!p.genre) continue;
    genrePrefCount[p.genre] = (genrePrefCount[p.genre] ?? 0) + 1;
  }
  const genreSaveCount: Record<string, number> = {};
  for (const s of filteredSaveLogs) {
    const e = entryById[s.entry_id ?? ""];
    if (!e?.genre) continue;
    genreSaveCount[e.genre] = (genreSaveCount[e.genre] ?? 0) + 1;
  }
  const genreShareCount: Record<string, number> = {};
  for (const s of filteredShares) {
    const e = entryById[s.entry_id ?? ""];
    if (!e?.genre) continue;
    genreShareCount[e.genre] = (genreShareCount[e.genre] ?? 0) + 1;
  }
  const genreConvRows = GENRE_KEYS.map(key => {
    const prefN  = genrePrefCount[key]  ?? 0;
    const saveN  = genreSaveCount[key]  ?? 0;
    const shareN = genreShareCount[key] ?? 0;
    return {
      key,
      label: GENRE_LABEL[key] ?? key,
      prefN,
      saveN,
      shareN,
      saveRate:  prefN >= 10 ? (saveN  / prefN) * 100 : null,
      shareRate: prefN >= 10 ? (shareN / prefN) * 100 : null,
    };
  }).sort((a, b) => b.prefN - a.prefN); // 선택 많은 장르 순

  // ── ③ 신규 vs 재방문 유저 행동 비교 ──
  // activeDate 있을 때만 의미 있음
  const newDeviceSet = new Set<string>();
  const retDeviceSet = new Set<string>();
  if (activeDate) {
    for (const did of distinctSet(filteredAnalyze)) {
      if (firstSeenMap[did] === activeDate) newDeviceSet.add(did);
      else retDeviceSet.add(did);
    }
  }
  const newSuccessUsers = distinctSet(filteredAnalyze.filter(l => l.status === "success" && l.device_id && newDeviceSet.has(l.device_id))).size;
  const retSuccessUsers = distinctSet(filteredAnalyze.filter(l => l.status === "success" && l.device_id && retDeviceSet.has(l.device_id))).size;
  const newSaveUsers = distinctSet(filteredSaveLogs.filter(l => l.device_id && newDeviceSet.has(l.device_id))).size;
  const retSaveUsers = distinctSet(filteredSaveLogs.filter(l => l.device_id && retDeviceSet.has(l.device_id))).size;
  const newShareCount = filteredShares.filter(l => l.device_id && newDeviceSet.has(l.device_id)).length;
  const retShareCount = filteredShares.filter(l => l.device_id && retDeviceSet.has(l.device_id)).length;
  const newSaveRate  = newSuccessUsers > 0 ? (newSaveUsers  / newSuccessUsers) * 100 : null;
  const retSaveRate  = retSuccessUsers > 0 ? (retSaveUsers  / retSuccessUsers) * 100 : null;
  const newShareRate = newSuccessUsers > 0 ? (newShareCount / newSuccessUsers) * 100 : null;
  const retShareRate = retSuccessUsers > 0 ? (retShareCount / retSuccessUsers) * 100 : null;

  const refreshLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  // ── 대시보드 ──
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)", padding: "52px 20px 48px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ color: "#C4687A", fontSize: 12, letterSpacing: "0.15em", marginBottom: 4 }}>Play the Picture</p>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>관리자 대시보드</h1>
          {refreshLabel && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>마지막 업데이트 {refreshLabel}</p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{ background: loading ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20, padding: "8px 16px", color: loading ? "rgba(255,255,255,0.35)" : "#fff", fontSize: 12, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "로딩 중..." : "↻ 새로고침"}
        </button>
      </div>

      {/* 데이터 소스 토글 (유저 / 테스트) */}
      {INTERNAL_DEVICE_IDS.size > 0 && (
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>데이터</span>
          <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 3 }}>
            {(["user", "test"] as const).map((m) => {
              const isActive = viewMode === m;
              const label = m === "user" ? "유저 데이터" : "테스트 데이터";
              return (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 18,
                    border: "none",
                    background: isActive ? (m === "test" ? "#4a6a8a" : "#C4687A") : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {viewMode === "test" && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              내부 기기 {INTERNAL_DEVICE_IDS.size}개 기록만 표시
            </span>
          )}
        </div>
      )}

      {/* 날짜 필터 탭 */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {(["today", "yesterday", "all", "custom"] as const).map((t) => {
            const isActive = tab === t;
            const label = t === "today" ? "오늘" : t === "yesterday" ? "어제" : t === "all" ? "전체" : "기간 선택";
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  // 기간 선택 탭 첫 진입 시 기본값 7일
                  if (t === "custom" && !customStart && !customEnd) {
                    setCustomStart(kstOffset(today, -6));
                    setCustomEnd(today);
                  }
                }}
                style={{
                  padding: "7px 18px",
                  borderRadius: 20,
                  border: isActive ? "none" : "1px solid rgba(255,255,255,0.15)",
                  background: isActive ? "#C4687A" : "transparent",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
          <span style={{ alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>
            {tab === "today"     ? today :
             tab === "yesterday" ? yesterday :
             tab === "custom" && rangeValid
               ? `${rangeStartDate} ~ ${rangeEndDate} (${rangeDayCount}일간)`
               : "누적"}
          </span>
        </div>

        {/* 기간 선택 탭 활성 시 range input 노출 */}
        {tab === "custom" && (
          <div style={{ marginTop: 12 }}>
            {/* 날짜 입력 행 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="date"
                value={customStart}
                max={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomStart(v);
                  if (customEnd && v > customEnd) setCustomEnd(v);
                }}
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 13, cursor: "pointer", outline: "none", colorScheme: "dark" }}
              />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>~</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={today}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 13, cursor: "pointer", outline: "none", colorScheme: "dark" }}
              />
              {rangeDayCount > 90 && (
                <span style={{ fontSize: 11, color: "#f0c060" }}>⚠ 90일 초과 — 쿼리 속도가 느려질 수 있어요</span>
              )}
            </div>
            {/* 프리셋 버튼 */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {([3, 7, 14] as const).map(n => (
                <button
                  key={n}
                  onClick={() => { setCustomStart(kstOffset(today, -(n - 1))); setCustomEnd(today); }}
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}
                >
                  최근 {n}일
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 섹션: KEY METRICS (북극성 지표) ── */}
      {/* 5/10 재정의 — viral 행동률 (URL ∪ 스토리 합집합) + organic 비중 (cohort 측정) 도입 */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>KEY METRICS</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {/* viral 행동률 — URL 공유 ∪ 스토리 저장 합집합 (스토리 outcome 14배 lever 반영) */}
        <ConvCard
          label="viral 행동률"
          value={viralActionRate}
          sub={`${shareBranchUsers}명 / ${successUsers}명 · URL ∪ 스토리`}
          accent={successUsers >= 10 ? accentByRate(viralActionRate, 15, 5) : C.gray}
          tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "성공 유저 중 URL 공유 또는 스토리 저장 한 비율 (합집합). 5/10 재정의 — 기존 '공유율(URL only)'은 14배 큰 스토리 outcome을 빼고 측정해 viral 약화 신호 못 잡았음"}
          avg7d={last7ViralActionRate != null ? {
            value: last7ViralActionRate.toFixed(1) + "%",
            delta: successUsers > 0
              ? (() => {
                  const curr = (shareBranchUsers / successUsers) * 100;
                  const diff = curr - last7ViralActionRate;
                  if (Math.abs(diff) < Math.max(last7ViralActionRate * 0.1, 1)) return "flat" as const;
                  return diff > 0 ? "up" as const : "down" as const;
                })()
              : null,
          } : undefined}
        />
        {/* 1회차 저장율 — 표본 30 이상에서만 색상 판정 */}
        <ConvCard
          label="1회차 저장율"
          value={firstSaveRatePct != null ? firstSaveRatePct.toFixed(1) + "%" : "—"}
          sub={`${attemptBuckets["1"].saved}명 / ${attemptBuckets["1"].attempts}명`}
          accent={attemptBuckets["1"].attempts >= 30 && firstSaveRatePct != null ? accentByRate(firstSaveRatePct.toFixed(1) + "%", 10, 5) : C.gray}
          tooltip={attemptBuckets["1"].attempts < 30 ? "표본 30명 미만 — 판단 보류" : "유저의 첫 성공 분석에서 저장까지 간 비율 (광고 ROI 직결 지표)"}
          avg7d={last7FirstSaveRate != null ? {
            value: last7FirstSaveRate.toFixed(1) + "%",
            delta: firstSaveRatePct != null
              ? (() => {
                  const diff = firstSaveRatePct - last7FirstSaveRate;
                  if (Math.abs(diff) < Math.max(last7FirstSaveRate * 0.1, 1)) return "flat" as const;
                  return diff > 0 ? "up" as const : "down" as const;
                })()
              : null,
          } : undefined}
        />
        {/* 종합 듣기 만족도 — 미리듣기 ∪ 외부 앱 듣기 (5/3 도입, listen_click 단일 지표 대체) */}
        <ConvCard
          label="종합 듣기 만족도"
          value={overallListenRate}
          sub={`${listenSatisfiedUsers}명 / ${successUsers}명 · 미리듣기 ∪ 외부 앱`}
          accent={successUsers >= 10 ? accentByRate(overallListenRate, 40, 25) : C.gray}
          tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "미리듣기 또는 외부 앱 듣기 발생 유저 비율. 곡 매력도 + 추천 정확도 종합 측정. 30초 미리듣기 도입 후 listen_click 단일 지표가 변질되어 도입한 합집합 지표. 5/10 임계값 50/30→40/25 (14일 baseline median 32%, green 0/14일 달성으로 비현실적)"}
        />
        {/* organic 비중 — 신규 device 첫 분석 utm_source NULL 비율 (cohort viral health) */}
        <ConvCard
          label="organic 비중 (신규)"
          value={organicRatePct != null ? organicRatePct.toFixed(1) + "%" : "—"}
          sub={`${periodOrganicCount}명 / ${periodNewCount}명 · null+ig+instagram`}
          accent={periodNewCount >= 20 && organicRatePct != null ? accentByRate(organicRatePct.toFixed(1) + "%", 25, 15) : C.gray}
          tooltip={periodNewCount < 20 ? "신규 20명 미만 — 판단 보류" : "신규 device 중 첫 분석 시 utm_source가 (null) 또는 ig/instagram인 비율 (광고 외 = viral·검색·즐겨찾기·word-of-mouth·인스타 referrer 합). 5/11 정의 통일 — VIRAL LOOP cohort chart와 동일 (Meta 광고만 utm=meta로 박힘). direct attribution 한계 보완하는 cohort 단위 viral health KPI"}
          avg7d={last7OrganicRate != null ? {
            value: last7OrganicRate.toFixed(1) + "%",
            delta: organicRatePct != null
              ? (() => {
                  const diff = organicRatePct - last7OrganicRate;
                  if (Math.abs(diff) < Math.max(last7OrganicRate * 0.1, 1)) return "flat" as const;
                  return diff > 0 ? "up" as const : "down" as const;
                })()
              : null,
          } : undefined}
        />
      </div>

      {/* ── 섹션: AUTH (Phase 1A 로그인 게이트 funnel) ── */}
      {/* 5/12 도입 — gate_shown / 가입 방식 / linkIdentity / 충돌 / 닉네임 변경 / 에러 분류
          데이터 소스: auth_logs. 표본 부족 시(<10) 색상 판정 보류 (회색). */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>AUTH</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {/* 1. 게이트 완료율 */}
        <ConvCard
          label="게이트 완료율"
          value={gateCompletionRatePct != null ? gateCompletionRatePct.toFixed(1) + "%" : "—"}
          sub={`${gateResolvedDeviceCount}명 통과 / ${gateShownDeviceCount}명 게이트 노출`}
          accent={gateShownDeviceCount >= 10 && gateCompletionRatePct != null ? accentByRate(gateCompletionRatePct.toFixed(1) + "%", 70, 50) : C.gray}
          tooltip={gateShownDeviceCount < 10 ? "게이트 노출 10명 미만 — 판단 보류" : "게이트 본 device 중 가입/스킵 중 하나로 통과한 비율 (signup_complete · guest_skip · anonymous_signin_success · kakao/google/apple_login_success). 낮으면 게이트 디자인이 사용자를 이탈시킴. 게이트 ON/OFF 무관하게 funnel 본질 측정"}
        />
        {/* 2. 가입 방식별 — 가장 큰 비율 표시 + sub로 분포 */}
        <ConvCard
          label="우세 가입 방식"
          value={dominantMethod ? `${dominantMethod} ${dominantSharePct!.toFixed(0)}%` : "—"}
          sub={`비회원 ${anonSignupDevices} · 카카오 ${kakaoSignupDevices} · Google ${googleSignupDevices} · Apple ${appleSignupDevices}`}
          accent={totalSignupDevices >= 5 ? "#C4687A" : C.gray}
          tooltip={totalSignupDevices < 5 ? "가입 5건 미만 — 판단 보류" : "각 가입 success 이벤트의 device 수. 비회원이 압도적으로 높으면 가입 마찰 큼 (정식 가입 funnel 추가 필요). Google/Apple이 높으면 사용자 신뢰도 ↑"}
        />
        {/* 3. linkIdentity 사용률 — 모든 provider (Kakao·Google·Apple·passkey 등) 합산 */}
        <ConvCard
          label="비회원 → 정식 전환율"
          value={linkRatePct != null ? linkRatePct.toFixed(1) + "%" : "—"}
          sub={`${linkStartDevices}명 시도 / ${anonSignupDevices}명 비회원 가입`}
          accent={anonSignupDevices >= 10 && linkRatePct != null ? accentByRate(linkRatePct.toFixed(1) + "%", 15, 5) : C.gray}
          tooltip={anonSignupDevices < 10 ? "비회원 가입 10명 미만 — 판단 보류" : "비회원으로 시작한 device 중 정식 계정 연동(Kakao·Google·Apple 등) 클릭한 비율. 비회원 → 정식 가입 funnel 효율. 산업 baseline 5-15%, 15% 이상이면 우수"}
        />
        {/* 4. 충돌 발생률 */}
        <ConvCard
          label="merge 충돌 발생"
          value={conflictRatePct != null ? conflictRatePct.toFixed(1) + "%" : "—"}
          sub={`${accountMergedCount}건 merge / ${linkStartDevices}건 link 시도`}
          accent={
            linkStartDevices < 10 || conflictRatePct == null ? C.gray :
            conflictRatePct <= 3 ? C.green :
            conflictRatePct <= 5 ? C.yellow :
            C.red
          }
          tooltip={linkStartDevices < 10 ? "link 시도 10건 미만 — 판단 보류" : "linkIdentity 시도 중 같은 이메일이 이미 다른 user에 묶여있어 conflict merge로 이어진 비율. 추정 baseline 3%. 5% 넘으면 UX 점검 (사용자가 다른 계정 인지 못 함)"}
        />
        {/* 5. 닉네임 변경률 */}
        <ConvCard
          label="닉네임 변경률"
          value={nicknameChangeRatePct != null ? nicknameChangeRatePct.toFixed(1) + "%" : "—"}
          sub={`${nicknameChangedDevices}명 변경 / ${signupCompleteDevices}명 가입 완료`}
          accent={
            signupCompleteDevices < 10 || nicknameChangeRatePct == null ? C.gray :
            nicknameChangeRatePct <= 30 ? C.green :
            nicknameChangeRatePct <= 50 ? C.yellow :
            C.red
          }
          tooltip={signupCompleteDevices < 10 ? "가입 완료 10명 미만 — 판단 보류" : "가입 완료 device 중 닉네임 변경한 비율. 50% 넘으면 자동 닉네임 풀 품질 낮음 (재생성·수정 마찰). 5% 미만이면 변경 UI 못 찾는 케이스"}
        />
        {/* 6. 인증 에러 분류 */}
        <ConvCard
          label="인증 에러 합계"
          value={totalAuthFailCount.toString() + "건"}
          sub={`anon ${anonFailCount} · link ${linkFailCount} · merge ${mergeFailCount}`}
          accent={totalAuthFailCount === 0 ? C.gray : totalAuthFailCount < 5 ? "#C4687A" : "#f07070"}
          tooltip="인증 실패 이벤트 합계 — anonymous_signin_failed, identity_link_failed, account_merged(failed). 1자리수면 산발적 네트워크 이슈. 두 자리수면 systemic 버그 의심"
        />
      </div>

      {/* ── 섹션: 유저 (축소 — DAU + 신규/재방문 비율만) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>USERS</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {(activeDate || (tab === "custom" && rangeValid)) ? (
          <>
            <ConvCard
              label={
                tab === "today"     ? "오늘 DAU" :
                tab === "yesterday" ? "어제 DAU" :
                rangeDayCount === 1 ? `DAU (${rangeStartDate})` :
                "기간 내 활동 유저"
              }
              value={`${dau.toLocaleString()}명`}
              sub={
                tab === "custom" && rangeDayCount > 1
                  ? `일평균 ${(dau / rangeDayCount).toFixed(1)}명`
                  : "분석 기준 활성 유저"
              }
              accent={C.white}
            />
            <div title="신규(첫 분석) / 재방문 비율. 재방문 비율이 높을수록 바이럴·재방문 가치 상승" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 18px", cursor: "help" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 6 }}>신규 / 재방문</span>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, display: "block", color: "rgba(255,255,255,0.75)" }}>
                {pct(newUsers, dau)} <span style={{ color: "rgba(255,255,255,0.35)" }}>/</span> {pct(returnUsers, dau)}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginTop: 4, display: "block" }}>{newUsers}명 / {returnUsers}명</span>
            </div>
          </>
        ) : (
          <ConvCard
            label="누적 총 유저 수"
            value={totalUniqueUsers.toLocaleString()}
            sub="전체 기간 중 분석한 고유 device_id"
            accent="#a0d4f0"
          />
        )}
      </div>

      {/* ── 섹션: 퍼널 흐름 (분석 성공까지) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>FUNNEL — 분석까지</p>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 14px", marginBottom: 12 }}>
        <FunnelStep icon="📷" label="사진 업로드" count={photoCount} conv={pct(analyzeUsers, photoUsers)} userCount={photoUsers} />
        <FunnelStep icon="🎵" label="장르·에너지 선택" count={prefCount} conv={pct(analyzeUsers, analyzeUsers)} userCount={analyzeUsers} />
        <FunnelStep icon="✦" label="분석 시작" count={analyzeStartCount} conv={pct(successUsers, analyzeUsers)} userCount={analyzeUsers} />
        <FunnelStep icon="✓" label="분석 성공" count={successCount} conv={pct(anyActionUsers, successUsers)} userCount={successUsers} isLast emphasis="strong" />
      </div>

      {/* ── 섹션: 분석 성공 후 3갈래 병렬 분기 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>FUNNEL — 분석 후 분기 (3갈래 병렬)</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
        {/* 🎵 듣기 갈래 */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🎵</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>듣기 갈래</span>
            <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#fff" }}>{listenBranchRate}</span>
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{listenBranchUsers}명 / {successUsers}명 진입</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>🎧 미리듣기 재생률</span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{previewPlayRate}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>⏱ 30초 완료율</span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{previewCompleteRate}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>▶ 외부 앱 듣기율</span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{userListenRate}</span>
            </div>
          </div>
        </div>

        {/* 💾 저장 갈래 */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>💾</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>저장 갈래</span>
            <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#fff" }}>{saveBranchRate}</span>
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{saveBranchUsers}명 / {successUsers}명 진입</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>저장 건수</span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{saveCount}건</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              모아보기 재방문 = D1 retention<br/>(별도 측정 인프라 필요)
            </div>
          </div>
        </div>

        {/* ↑ 공유 갈래 — URL 공유 + 스토리 저장 sub-funnel */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>↑</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>공유 갈래</span>
            <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#fff" }}>{shareBranchRate}</span>
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{shareBranchUsers}명 / {successUsers}명 진입 (URL 공유 ∪ 스토리 저장)</p>
          {/* sub 1: URL 공유 */}
          <div style={{ borderLeft: "2px solid rgba(255,255,255,0.12)", paddingLeft: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, fontWeight: 600 }}>🔗 URL 공유</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>↑ 공유 건수</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{shareCount}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>👁 unique 친구 도달</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{uniqueReachPerShare != null ? uniqueReachPerShare.toFixed(2) : "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>→ 나도 해보기</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{tryCount}건</span>
              </div>
            </div>
          </div>
          {/* sub 2: 스토리 저장 (NEW) */}
          <div style={{ borderLeft: "2px solid rgba(255,255,255,0.12)", paddingLeft: 10 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, fontWeight: 600 }}>📷 스토리 저장</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>📷 클릭</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{storyClickedCount}건</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>✓ 이미지 생성</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{storyGeneratedCount}건{storyClickedCount > 0 ? ` (${pct(storyGeneratedCount, storyClickedCount)})` : ""}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>✦ Share completed</span>
                <span style={{ fontWeight: 600, color: "#fff" }}>{storySharedCount}건{storyGeneratedCount > 0 ? ` (${pct(storySharedCount, storyGeneratedCount)})` : ""}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 헤비 유저 / 이탈률 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard
          label="헤비 유저 (3가지 다)"
          value={heavyUserRate}
          sub={`${heavyUsers}명 / ${successUsers}명 · 듣기+저장+공유 모두`}
          accent={successUsers >= 100 ? accentByRate(heavyUserRate, 3, 1) : C.gray}
          tooltip={successUsers < 100 ? "표본 100명 미만 — 판단 보류 (5/10 가드 강화)" : "분석 성공 유저 중 듣기·저장·공유 모두 한 사용자 비율. viral 핵심 후보 (수퍼 팬). 5/10 임계값 5/1→3/1 (14일 max 4.6%, sample 작아 표본 가드 100명+로 강화)"}
        />
        <ConvCard
          label="이탈률"
          value={dropoffRate}
          sub={`${dropoffUsers}명 / ${successUsers}명 · 어떤 행동도 X`}
          accent={successUsers >= 10 ? (() => {
            // 역방향 — 낮을수록 green
            const num = parseFloat(dropoffRate);
            if (isNaN(num)) return C.gray;
            return num < 55 ? C.green : num < 70 ? C.yellow : C.red;
          })() : C.gray}
          tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "분석 성공 유저 중 듣기·저장·공유 모두 안 한 비율. 5/10 임계값 <50/<70 → <55/<70 (14일 median 55%, green 1/14일만 달성)"}
        />
      </div>

      {/* ── 섹션: 전환율 (유저 기준) ── */}
      {/* "전체 공유율"은 KEY METRICS의 viral 행동률(URL ∪ 스토리)이 더 정직 — 중복 제거 (5/10) */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>CONVERSION</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard label="분석 성공률" value={userSuccessRate} sub={`${successUsers}명 / ${analyzeUsers}명`} accent={convSuccessAccent} tooltip="분석 시작 유저 중 성공한 유저 비율" />
        <ConvCard label="전체 저장률 (유저 기준)" value={userSaveRate} sub={`${saveUsers}명 / ${successUsers}명`} accent={convSaveAccent} tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "성공 유저 중 한 번이라도 저장한 유저 비율 (회차 무관). 1회차 저장율은 KEY METRICS 참고"} />
      </div>

      {/* ── 섹션: VIRAL LOOP — 5/10 재구조: 🔗 URL / 📷 스토리 / 📈 cohort 추세 3 sub ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>VIRAL LOOP</p>

      {/* sub-heading: URL 공유 viral */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600 }}>🔗 URL 공유 viral</p>
      {shareCount === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px 18px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 15 }}>↑</span>
          <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>기간 내 URL 공유 없음</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            공유 0 · 조회 {viewCount} · 유입 {tryCount}
          </span>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {/* 1행 — 진짜 viral 측정 (자가 view·동일 친구 다회 클릭 노이즈 제거) */}
          <ConvCard
            label="공유 1건당 unique 친구 도달"
            value={uniqueReachPerShare != null ? uniqueReachPerShare.toFixed(2) : "—"}
            sub={`${uniqueFriendReach}명 / ${shareCount}공유`}
            accent={shareCount >= 5 && uniqueReachPerShare != null ? (uniqueReachPerShare >= 1.0 ? C.green : uniqueReachPerShare >= 0.5 ? C.yellow : C.red) : C.gray}
            tooltip={shareCount < 5 ? "공유 5건 미만 — 판단 보류" : "진짜 viral coefficient. 자가 view + 동일 친구 다회 클릭 제외. ≥1.0 작동선"}
          />
          <ConvCard
            label="자가 view 비중"
            value={selfViewRatio != null ? `${selfViewRatio.toFixed(0)}%` : "—"}
            sub={`${selfViewCount}자가 / ${totalViewsForRatio}전체`}
            accent={totalViewsForRatio >= 5 && selfViewRatio != null ? (selfViewRatio < 10 ? C.green : selfViewRatio < 30 ? C.yellow : C.red) : C.gray}
            tooltip={totalViewsForRatio < 5 ? "조회 5건 미만 — 판단 보류" : "raw 조회 지표의 신뢰도. 30%+ 면 raw 보정 필요. 사용자가 자기 결과 다시 본 비율"}
          />
          {/* 2행 — raw 지표 (자가 view 포함, 비교용) */}
          <ConvCard
            label="공유 1건당 raw 조회"
            value={viewPerShare != null ? viewPerShare.toFixed(1) : "—"}
            sub={`${viewCount}조회 / ${shareCount}공유 · 자가 포함`}
            accent={shareCount >= 5 && viewPerShare != null ? (viewPerShare >= 2 ? C.green : viewPerShare >= 0.5 ? C.yellow : C.red) : C.gray}
            tooltip={shareCount < 5 ? "공유 5건 미만 — 판단 보류" : "share_views row 합계 / 공유 건수. 자가 view 포함된 raw count — unique 친구 도달과 비교 가치"}
          />
          <ConvCard
            label="공유 1건당 유입"
            value={tryPerShare != null ? tryPerShare.toFixed(2) : "—"}
            sub={`${tryCount}유입 / ${shareCount}공유`}
            accent={shareCount >= 5 && tryPerShare != null ? (tryPerShare >= 0.5 ? C.green : tryPerShare >= 0.2 ? C.yellow : C.red) : C.gray}
            tooltip={shareCount < 5 ? "공유 5건 미만 — 판단 보류" : "공유 1건이 만들어낸 나도해보기 클릭 수"}
          />
          {/* URL K-factor — 5/10 KEY METRICS에서 강등 (인스타 viral 측정 안 됨, organic 비중이 정직) */}
          <ConvCard
            label="URL K-factor (측정 가능)"
            value={kFactor != null ? kFactor.toFixed(2) : "—"}
            sub={`${tryCount} 유입 / ${successUsers}명 · URL only`}
            accent={successUsers >= 10 && kFactor != null ? (kFactor >= 0.05 ? C.green : kFactor >= 0.02 ? C.yellow : C.red) : C.gray}
            tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "성공 유저 1명당 share URL 통해 데려온 try_click 수. ⚠️ 인스타 스토리 viral은 영원히 안 잡힘 — KEY METRICS의 organic 비중 참조. 5/10 임계값 0.1/0.05 → 0.05/0.02 (w2 baseline 0.022, share funnel sample 작아 reality 반영)"}
            avg7d={last7KFactor != null ? {
              value: last7KFactor.toFixed(2),
              delta: kFactor != null
                ? (() => {
                    const diff = kFactor - last7KFactor;
                    if (Math.abs(diff) < Math.max(last7KFactor * 0.1, 0.05)) return "flat" as const;
                    return diff > 0 ? "up" as const : "down" as const;
                  })()
                : null,
            } : undefined}
          />
        </div>
      )}

      {/* sub-heading: 스토리 viral (5/10 신규) */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600 }}>📷 스토리 viral</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {/* Card A: 스토리 viral 시도율 — 5/3-5/10 baseline median 12% / 임계값 ≥15/≥10 */}
        <ConvCard
          label="스토리 viral 시도율"
          value={storyViralRate}
          sub={`${storyViralUsers}명 / ${successUsers}명 · 인스타 outcome`}
          accent={successUsers >= 30 ? accentByRate(storyViralRate, 15, 10) : C.gray}
          tooltip={successUsers < 30 ? "성공 유저 30명 미만 — 판단 보류" : "성공 유저 중 인스타 스토리 outcome (shared·downloaded) 도달 비율. 5/3-5/10 baseline median 12% / range 6.7-24.6% — 임계값 ≥15% green / ≥10% yellow"}
          avg7d={last7StoryViralRate != null ? {
            value: last7StoryViralRate.toFixed(1) + "%",
            delta: successUsers > 0 && storyViralRate !== "—" ? (() => {
              const curr = (storyViralUsers / successUsers) * 100;
              const diff = curr - last7StoryViralRate;
              if (Math.abs(diff) < Math.max(last7StoryViralRate * 0.1, 1)) return "flat" as const;
              return diff > 0 ? "up" as const : "down" as const;
            })() : null,
          } : undefined}
        />
        {/* Card B: 스토리 viral 효율 — 5/3-5/10 baseline median 50% / 임계값 ≥60/≥40 */}
        <ConvCard
          label="스토리 viral 효율"
          value={storyEfficiencyPct != null ? storyEfficiencyPct.toFixed(1) + "%" : "—"}
          sub={`${storyOutcomes}건 / ${storyAttempts}attempts · 클릭→outcome`}
          accent={storyAttempts >= 10 && storyEfficiencyPct != null ? (storyEfficiencyPct >= 60 ? C.green : storyEfficiencyPct >= 40 ? C.yellow : C.red) : C.gray}
          tooltip={storyAttempts < 10 ? "스토리 클릭 10건 미만 — 판단 보류" : "스토리 버튼 클릭 후 인스타 공유·다운로드 도달 비율. 5/3-5/10 baseline median 50% / range 30-77%. android_inapp 환경은 webview 차단으로 inapp_shown만 끝나 효율 자연 ↓ — 환경별 표 함께 봐야"}
          avg7d={last7StoryEfficiency != null ? {
            value: last7StoryEfficiency.toFixed(1) + "%",
            delta: storyEfficiencyPct != null
              ? (() => {
                  const diff = storyEfficiencyPct - last7StoryEfficiency;
                  if (Math.abs(diff) < Math.max(last7StoryEfficiency * 0.1, 2)) return "flat" as const;
                  return diff > 0 ? "up" as const : "down" as const;
                })()
              : null,
          } : undefined}
        />
      </div>

      {/* sub-heading: 유입 cohort 7일 추세 (Mini chart 옵션 X — 광고 vs organic 누적 막대) */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600 }}>📈 유입 cohort 7일 추세 (광고 vs organic)</p>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
        {cohort7dDays.every(d => d.total === 0) ? (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>최근 7일 신규 device 데이터 없음</p>
        ) : (
          <>
            {cohort7dDays.map(d => {
              const metaPct = d.total > 0 ? (d.meta / cohort7dMax) * 100 : 0;
              const organicPct = d.total > 0 ? (d.organic / cohort7dMax) * 100 : 0;
              const orgRatioPct = d.total > 0 ? Math.round((d.organic / d.total) * 100) : 0;
              return (
                <div key={d.date} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>
                    <span>{d.date.slice(5)}</span>
                    <span>
                      <span style={{ color: "#C4687A" }}>광고 {d.meta}</span>
                      {" · "}
                      <span style={{ color: "#6be0a0" }}>organic {d.organic}</span>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}> · {orgRatioPct}%</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${metaPct}%`, background: "#C4687A" }} />
                    <div style={{ width: `${organicPct}%`, background: "#6be0a0" }} />
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              <span style={{ color: "#C4687A" }}>■</span> 광고 (meta paid) &nbsp;
              <span style={{ color: "#6be0a0" }}>■</span> organic (utm null·ig·instagram)
            </p>
          </>
        )}
      </div>

      {/* 📷 스토리 저장 환경별 — 광고 ROAS 시너지 신호 (인스타 인앱 비율 ↑ = Meta 알고리즘 학습 효과) */}
      {storyClickedCount > 0 && (
        <div style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8, fontWeight: 600 }}>
            📷 스토리 저장 환경별 ({storyClickedCount}건)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <div>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>android_instagram_inapp: </span>
              <span style={{ fontWeight: 600, color: "#C4687A" }}>{storyAndroidInstaRate}</span>
              <span style={{ color: "rgba(255,255,255,0.35)" }}> ({storyEnvCounts["android_instagram_inapp"] ?? 0})</span>
            </div>
            <div>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>ios_instagram_inapp: </span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{storyIosInstaRate}</span>
              <span style={{ color: "rgba(255,255,255,0.35)" }}> ({storyEnvCounts["ios_instagram_inapp"] ?? 0})</span>
            </div>
            <div>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>ios_safari: </span>
              <span style={{ fontWeight: 600, color: "#fff" }}>{storyIosSafariRate}</span>
              <span style={{ color: "rgba(255,255,255,0.35)" }}> ({storyEnvCounts["ios_safari"] ?? 0})</span>
            </div>
            {Object.entries(storyEnvCounts)
              .filter(([env]) => env !== "android_instagram_inapp" && env !== "ios_instagram_inapp" && env !== "ios_safari")
              .sort((a, b) => b[1] - a[1])
              .map(([env, count]) => (
                <div key={env}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{env}: </span>
                  <span style={{ fontWeight: 600, color: "#fff" }}>{pct(count, storyClickedCount)}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)" }}> ({count})</span>
                </div>
              ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
            <span style={{ color: "#C4687A" }}>android_instagram_inapp</span>는 share completed 도달 불가(webview 차단) — inapp_shown으로만 끝남.
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            외부 환경 fallback: 다운로드 {storyDownloadedCount}건 / 취소 {storyCancelledCount}건 / 실패 {storyFailedCount}건
          </div>
        </div>
      )}

      {/* ── 섹션: 🎵 듣기 만족도 (5/3 도입) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>🎵 LISTEN SATISFACTION</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard
          label="미리듣기 재생률"
          value={previewPlayRate}
          sub={`${previewPlayedUsers}명 / ${successUsers}명`}
          accent={successUsers >= 10 ? accentByRate(previewPlayRate, 70, 50) : C.gray}
          tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "분석 성공 유저 중 ▶ 재생 버튼 누른 비율. 곡 호기심 1단계 — 낮으면 미리듣기 UI 가시성 또는 곡 호감 약함. 5/10 임계값 50/30 → 70/50 (5/3 도입 후 baseline 70-81%, 50%는 항상 green이라 의미 X)"}
        />
        <ConvCard
          label="30초 완료율"
          value={previewCompleteRate}
          sub={`${previewCompletedUsers}명 / ${previewPlayedUsers}명`}
          accent={previewPlayedUsers >= 5 ? accentByRate(previewCompleteRate, 35, 25) : C.gray}
          tooltip={previewPlayedUsers < 5 ? "재생 5건 미만 — 판단 보류" : "재생 시작한 유저 중 30초 끝까지 들은 비율. 곡 매력도 척도 — 낮으면 추천 정확도 또는 곡 풀 다양성 약함. 5/10 임계값 60/40 → 35/25 (5/3 도입 후 baseline 17-37%, 60%는 도달 0)"}
        />
        <ConvCard
          label="외부 앱 듣기율"
          value={userListenRate}
          sub={`${listenUsers}명 / ${successUsers}명`}
          accent={successUsers >= 10 ? accentByRate(userListenRate, 35, 20) : C.gray}
          tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "Spotify·YouTube 등 외부 앱 듣기 클릭 비율. 미리듣기 30초로 만족 시 낮을 수 있음 (참고용, 단일 지표 X). 5/10 임계값 40/20 → 35/20 (14일 baseline median 32%)"}
        />
        <ConvCard
          label="iTunes 매칭률"
          value={itunesMatchRate != null ? itunesMatchRate.toFixed(1) + "%" : "—"}
          sub={`${itunesMatchedRows}곡 / ${itunesTotalRows}곡 · 곡 풀 인프라`}
          accent={itunesTotalRows >= 100 && itunesMatchRate != null ? (itunesMatchRate >= 90 ? C.green : itunesMatchRate >= 85 ? C.yellow : C.red) : C.gray}
          tooltip={itunesTotalRows < 100 ? "곡 100개 미만 — 판단 보류" : "iTunes API 매칭 성공한 곡 비율 (matched/duration/llm/manual 합산). low_score 곡은 미리듣기 차단 — fix 작업 baseline. 5/10 임계값 95/90 → 90/85 (현재 87.5%, 95% 비현실적)"}
        />
      </div>

      {/* ── 섹션: QUALITY (회차별 + 재뽑기 텀) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>QUALITY</p>

      {/* 회차별 저장율/공유율 */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>회차별 저장율 / 공유율</p>
        {(() => {
          // 모든 회차 × (저장/공유) 중 최대값을 기준으로 공통 스케일링
          const globalMaxRate = Math.max(
            1,
            ...(["1", "2", "3", "4+"] as const).flatMap(k => {
              const b = attemptBuckets[k];
              if (b.attempts === 0) return [0];
              return [(b.saved / b.attempts) * 100, (b.shared / b.attempts) * 100];
            })
          );
          return (["1", "2", "3", "4+"] as const).map(k => {
            const b = attemptBuckets[k];
            const saveRate  = b.attempts > 0 ? (b.saved  / b.attempts) * 100 : 0;
            const shareRate = b.attempts > 0 ? (b.shared / b.attempts) * 100 : 0;
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                  <span>{k}회차 ({b.attempts}회)</span>
                  <span>저장 {saveRate.toFixed(1)}% · 공유 {shareRate.toFixed(1)}%</span>
                </div>
                {/* 저장 bar */}
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
                  <div style={{ height: "100%", width: `${(saveRate / globalMaxRate) * 100}%`, background: "#C4687A" }} />
                </div>
                {/* 공유 bar */}
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(shareRate / globalMaxRate) * 100}%`, background: "#6be0a0" }} />
                </div>
              </div>
            );
          });
        })()}
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
          <span style={{ color: "#C4687A" }}>■</span> 저장율 &nbsp; <span style={{ color: "#6be0a0" }}>■</span> 공유율
        </p>
      </div>

      {/* 재뽑기 텀 분포 */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
          재분석 텀 분포 <span style={{ color: "rgba(255,255,255,0.35)" }}>({retryGapTotal}건)</span>
        </p>
        {retryGapTotal === 0 ? (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>재분석 데이터 없음</p>
        ) : (
          retryGapBuckets.map(b => {
            const rate = (b.count / retryGapTotal) * 100;
            return (
              <div key={b.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>
                  <span>{b.label}</span>
                  <span>{b.count}건 · {rate.toFixed(1)}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${rate}%`, background: "#a0d4f0" }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── 섹션: 퍼포먼스 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>PERFORMANCE</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard
          label="평균 응답 시간"
          value={avgResponseMs != null ? (avgResponseMs >= 1000 ? `${(avgResponseMs / 1000).toFixed(1)}초` : `${avgResponseMs}ms`) : "—"}
          sub={`${completedLogs.length}건 기준${medianResponseMs != null ? ` · 중앙값 ${(medianResponseMs / 1000).toFixed(1)}초 · 최대 ${(maxResponseMs! / 1000).toFixed(1)}초` : ""}`}
          accent={perfResponseAccent}
        />
        <ConvCard label="분석 실패율" value={failRateStr} sub={`${failCount}회 / ${failUsers}명`} accent={perfFailAccent} />
        <ConvCard
          label="유저당 평균 분석 횟수"
          value={avgAnalysesPerUser === "—" ? "—" : `${avgAnalysesPerUser}회`}
          sub={avgAnalysesPerUser === "—"
            ? `${successCount}회 / ${successUsers}명`
            : `중앙값 ${medianAnalysesPerUser}회 · 최대 ${maxAnalysesPerUser}회`}
          accent={C.white}
          tooltip={`성공 ${successCount}회 ÷ 성공 유저 ${successUsers}명. 평균과 중앙값 차이가 크면 극단치(파워유저) 존재.`}
        />
        <ConvCard
          label="평균 체류 시간"
          value={avgDurationStr}
          sub={rvGray ? `${rvTotal}건 (표본 부족)` : `${rvTotal}건 기준`}
          accent={perfAvgDurAccent}
          tooltip="결과 화면 입장 후 이탈까지 시간"
        />
        <ConvCard
          label="30초 이상 체류"
          value={over30Pct}
          sub="진지하게 본 유저"
          accent={perfOver30Accent}
          tooltip={rvGray ? "표본 10건 미만 — 판단 보류" : "결과 화면 30초 이상 체류 비율"}
        />
        <ConvCard
          label="10초 미만 이탈"
          value={under10Pct}
          sub="빠른 이탈"
          accent={perfUnder10Accent}
          tooltip={rvGray ? "표본 10건 미만 — 판단 보류" : "결과 화면 10초 미만 이탈 비율"}
        />
      </div>

      {/* ── 섹션: 리텐션 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>RETENTION</p>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <ConvCard
            label="D1 리텐션"
            value={d1Rate}
            sub={`${d1Returned}명 / 어제 신규 ${d1BaseCount}명`}
            accent={d1Accent}
            tooltip={d1BaseCount < 5 ? "표본 5명 미만 — 판단 보류" : "어제 처음 방문 유저 중 오늘도 방문한 비율"}
          />
          <ConvCard
            label="D7 리텐션"
            value={d7Rate}
            sub={`${d7Returned}명 / 7일 전 신규 ${d7BaseCount}명`}
            accent={d7Accent}
            tooltip={d7BaseCount < 5 ? "표본 5명 미만 — 판단 보류" : "7일 전 처음 방문 유저 중 오늘도 방문한 비율"}
          />
          {/* Lifetime 재방문 비율 (5/10 신규) — 1회성 도구 reality 측정 */}
          <ConvCard
            label="lifetime 재방문 비율"
            value={lifetimeRate}
            sub={`${lifetimeReturned}명 / 14-30일 전 신규 ${lifetimeBaseCount}명`}
            accent={lifetimeAccent}
            tooltip={lifetimeBaseCount < 30 ? "cohort 30명 미만 — 판단 보류" : "14-30일 전 처음 방문 유저 중 그 후 한 번이라도 다시 방문한 비율. 1회성 도구의 진짜 retention 신호 (D1·D7는 SNS·게임 모델). 5/10 도입 baseline median 8% / range 1.9-17.6% (17일치 cohort)"}
          />
          <ConvCard
            label="평균 재방문 간격"
            value={avgRevisitDays != null ? `${avgRevisitDays}일` : "—"}
            sub={`재방문 유저 ${multiVisitGaps.length}명 기준`}
            accent={C.white}
            tooltip="첫 방문 ~ 가장 최근 방문 사이 평균 일수"
          />
        </div>

        {/* 코호트 상세 (접힘) */}
        <button
          onClick={() => setRetentionOpen(o => !o)}
          style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: retentionOpen ? "10px 10px 0 0" : 10,
            padding: "10px 14px", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>코호트 상세 (최근 7일)</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", display: "inline-block", transform: retentionOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </button>
        {retentionOpen && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px 14px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["날짜", "신규", "D1", "D3", "D7"].map(h => (
                    <th key={h} style={{ textAlign: h === "날짜" ? "left" : "right", padding: "4px 8px", color: "rgba(255,255,255,0.4)", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortRows.map(row => (
                  <tr key={row.date}>
                    <td style={{ padding: "5px 8px", color: row.date === today ? "#C4687A" : "rgba(255,255,255,0.7)" }}>{row.date.slice(5)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{row.newCount}명</td>
                    {row.dn.map((cell, i) => (
                      <td key={i} style={{ padding: "5px 8px", textAlign: "right", color: cell == null ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)" }}>
                        {cell == null ? "-" : `${cell.returned} (${cell.rate})`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
          ※ 리텐션은 표본이 작아 변동이 큽니다. 2~3주 추세를 함께 보세요.
        </p>

        {/* ── 신규 vs 재방문 행동 비교 ── */}
        {activeDate && (retSuccessUsers > 0 || newSuccessUsers > 0) && (
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 2 }}>신규 vs 재방문 행동</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
              성공 유저 기준 저장율·공유율 비교 (재방문 가치 측정)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "6px 14px", alignItems: "center", fontSize: 12 }}>
              <span></span>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>저장율</span>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>공유율</span>

              <span style={{ color: "rgba(255,255,255,0.55)" }}>신규 ({newSuccessUsers}명)</span>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>
                {newSaveRate != null ? `${newSaveRate.toFixed(1)}%` : "—"}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>({newSaveUsers}명)</span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>
                {newShareRate != null ? `${newShareRate.toFixed(1)}%` : "—"}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>({newShareCount}건)</span>
              </span>

              <span style={{ color: "rgba(255,255,255,0.55)" }}>재방문 ({retSuccessUsers}명)</span>
              <span style={{ color: retSaveRate != null && newSaveRate != null && retSaveRate > newSaveRate ? C.green : "rgba(255,255,255,0.75)", fontWeight: retSaveRate != null && newSaveRate != null && retSaveRate > newSaveRate ? 600 : 400 }}>
                {retSaveRate != null ? `${retSaveRate.toFixed(1)}%` : "—"}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4, fontWeight: 400 }}>({retSaveUsers}명)</span>
              </span>
              <span style={{ color: retShareRate != null && newShareRate != null && retShareRate > newShareRate ? C.green : "rgba(255,255,255,0.75)", fontWeight: retShareRate != null && newShareRate != null && retShareRate > newShareRate ? 600 : 400 }}>
                {retShareRate != null ? `${retShareRate.toFixed(1)}%` : "—"}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4, fontWeight: 400 }}>({retShareCount}건)</span>
              </span>
            </div>
            {retSuccessUsers < 5 && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
                ※ 재방문 유저 표본 5명 미만 — 비교 신뢰도 낮음
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 섹션: 콘텐츠 인사이트 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>CONTENT</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <RankList title="🎸 장르 선택 순위" items={topGenres} accent="#a0d4f0" />
        <RankList title="⚡ 에너지 선택 순위" items={topEnergy} accent="#a0f0b0" />
      </div>
      <div style={{ marginBottom: 8 }}>
        <RankList title="🎵 추천된 곡 Top 5" items={topSongs} accent="#C4687A" />
      </div>
      <div style={{ marginBottom: 8 }}>
        <RankList title="💾 가장 많이 저장된 곡 Top 5" items={topSavedSongs} accent="#7ec8e3" />
      </div>
      <div style={{ marginBottom: 8 }}>
        <RankList title="↑ 가장 많이 공유된 곡 Top 5 (URL ∪ 스토리)" items={topSharedSongs} accent="#6be0a0" />
      </div>

      {/* ── 장르별 저장률/공유율 ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "18px 20px", marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>🎸 장르별 저장률 / 공유율</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
          장르 선택 수 대비 저장·공유 비율 (장르당 10건 이상일 때 색상 표시)
        </p>
        {genreConvRows.every(r => r.prefN === 0) ? (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>데이터 없음</p>
        ) : (
          (() => {
            // 글로벌 max (색상 적용된 것만 기준)
            const rates = genreConvRows.flatMap(r => [r.saveRate, r.shareRate].filter((v): v is number => v != null));
            const globalMax = Math.max(1, ...rates);
            return genreConvRows.map(r => (
              <div key={r.key} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>
                  <span>{r.label} <span style={{ color: "rgba(255,255,255,0.3)" }}>({r.prefN})</span></span>
                  <span style={{ color: r.prefN < 10 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.65)" }}>
                    {r.saveRate != null ? `저장 ${r.saveRate.toFixed(1)}%` : `저장 ${r.saveN}건`} · {r.shareRate != null ? `공유 ${r.shareRate.toFixed(1)}%` : `공유 ${r.shareN}건`}
                  </span>
                </div>
                {/* 저장 bar */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                  <div style={{ height: "100%", width: `${((r.saveRate ?? 0) / globalMax) * 100}%`, background: r.prefN < 10 ? "rgba(196,104,122,0.35)" : "#C4687A" }} />
                </div>
                {/* 공유 bar */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((r.shareRate ?? 0) / globalMax) * 100}%`, background: r.prefN < 10 ? "rgba(107,224,160,0.35)" : "#6be0a0" }} />
                </div>
              </div>
            ));
          })()
        )}
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
          <span style={{ color: "#C4687A" }}>■</span> 저장률 &nbsp; <span style={{ color: "#6be0a0" }}>■</span> 공유율
        </p>
      </div>

      {/* ── 섹션: Spotify API 상태 (접힘) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>SPOTIFY</p>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setSpotifyOpen(o => !o)}
          style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: spotifyOpen ? "14px 14px 0 0" : 14,
            padding: "13px 18px", cursor: "pointer", color: "#fff",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>🎵 Spotify API 상태</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", display: "inline-block", transform: spotifyOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
        </button>
        {spotifyOpen && (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button
                onClick={checkSpotify}
                disabled={spotifyChecking}
                style={{ background: spotifyChecking ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "5px 12px", color: spotifyChecking ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 11, cursor: spotifyChecking ? "default" : "pointer" }}
              >
                {spotifyChecking ? "확인 중..." : "지금 확인"}
              </button>
            </div>
            {!spotifyStatus && !spotifyChecking && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>조회하지 않음</p>
            )}
            {spotifyChecking && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>확인 중...</p>
            )}
            {spotifyStatus && !spotifyChecking && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{
                  display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, width: "fit-content",
                  background: spotifyStatus.status === "ok" ? "rgba(80,200,120,0.18)" : spotifyStatus.status === "rate_limited" ? "rgba(220,60,60,0.18)" : "rgba(220,180,60,0.18)",
                  color: spotifyStatus.status === "ok" ? "#6be0a0" : spotifyStatus.status === "rate_limited" ? "#f07070" : "#f0d060",
                  border: `1px solid ${spotifyStatus.status === "ok" ? "rgba(80,200,120,0.3)" : spotifyStatus.status === "rate_limited" ? "rgba(220,60,60,0.3)" : "rgba(220,180,60,0.3)"}`,
                }}>
                  {spotifyStatus.status === "ok" ? "● 정상" : spotifyStatus.status === "rate_limited" ? "● 429 제한 중" : "● 토큰 오류"}
                </span>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                  확인 시각: {new Date(spotifyStatus.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
                <SpotifyCountdown spotifyStatus={spotifyStatus} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 섹션: 추천 품질 metrics (Catalog Coverage + Long-tail) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>추천 품질</p>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => {
            const next = !qualityOpen;
            setQualityOpen(next);
            if (next && !qualityMetrics && !qualityLoading) fetchQualityMetrics();
          }}
          style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: qualityOpen ? "14px 14px 0 0" : 14,
            padding: "13px 18px", cursor: "pointer", color: "#fff",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>📊 추천 품질 (Coverage · Long-tail)</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", display: "inline-block", transform: qualityOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
        </button>
        {qualityOpen && (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: 0 }}>외부 only · INTERNAL device 제외</p>
              <button
                onClick={fetchQualityMetrics}
                disabled={qualityLoading}
                style={{ background: qualityLoading ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "5px 12px", color: qualityLoading ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 11, cursor: qualityLoading ? "default" : "pointer" }}
              >
                {qualityLoading ? "로드 중..." : "새로고침"}
              </button>
            </div>

            {!qualityMetrics && !qualityLoading && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>조회하지 않음</p>
            )}
            {qualityLoading && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>로드 중...</p>
            )}
            {qualityMetrics && !qualityLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* 30일 metric */}
                <div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8, fontWeight: 600 }}>최근 30일 (외부)</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>Catalog Coverage</p>
                      <p style={{ fontSize: 18, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.coverage_pct}%</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>
                        {qualityMetrics.period_30d.unique_songs_recommended} / {qualityMetrics.pool_size}곡
                      </p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>Top 10 share</p>
                      <p style={{ fontSize: 18, color: qualityMetrics.period_30d.top10_share_pct > 15 ? "#f0a070" : "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.top10_share_pct}%</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>편향 진단 (낮을수록 분산)</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>Top 50 share</p>
                      <p style={{ fontSize: 18, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.top50_share_pct}%</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>상위 50곡 점유율</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>Long-tail share</p>
                      <p style={{ fontSize: 18, color: qualityMetrics.period_30d.long_tail_share_pct > 60 ? "#6be0a0" : "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.long_tail_share_pct}%</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>top 100 외 곡 점유</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>단일 곡 max</p>
                      <p style={{ fontSize: 18, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.max_single_song}회</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>가장 많이 추천된 곡</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>1회만 추천</p>
                      <p style={{ fontSize: 18, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_30d.one_off_pct}%</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, marginTop: 2 }}>{qualityMetrics.period_30d.one_off_songs}곡 (long-tail 강도)</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, marginTop: 8 }}>
                    총 추천 {qualityMetrics.period_30d.total_recs}건
                  </p>
                </div>

                {/* 7일 metric (cycle 효과 빠른 측정용) */}
                <div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8, fontWeight: 600 }}>최근 7일 (cycle 효과 측정)</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>총 추천</p>
                      <p style={{ fontSize: 16, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_7d.total_recs}건</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>단일 곡 max (7d)</p>
                      <p style={{ fontSize: 16, color: qualityMetrics.period_7d.max_single_song > 14 ? "#f0a070" : "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_7d.max_single_song}회</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, marginBottom: 2 }}>Top 10 share (7d)</p>
                      <p style={{ fontSize: 16, color: "#fff", margin: 0, fontWeight: 700 }}>{qualityMetrics.period_7d.top10_share_pct}%</p>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.5 }}>
                  ⚠️ 이 metric은 가드레일·편향 진단용. KPI/목표값으로 사용 X (Goodhart&apos;s Law).<br/>
                  진짜 KPI는 사용자 만족 (save_rate, retention).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 섹션: 관리 도구 (접힘) ── */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setAdminOpen(o => !o)}
          style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: adminOpen ? "14px 14px 0 0" : 14,
            padding: "14px 18px", cursor: "pointer", color: "#fff",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>🛠 관리 도구</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", transition: "transform 0.2s", display: "inline-block", transform: adminOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
        </button>
        {adminOpen && (
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "18px 20px" }}>
          <ImportTextSection showToast={showToast} />
        </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, padding: "10px 20px", borderRadius: 24, whiteSpace: "nowrap", zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
