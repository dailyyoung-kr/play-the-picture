"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PW = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "coldboardp1!";

type PhotoLog = { id: string; created_at: string; device_id?: string | null };
type PrefLog = { id: string; created_at: string; genre: string | null; energy: number | null; device_id?: string | null };
type AnalyzeLog = { id: string; created_at: string; status: string; response_time_ms: number | null; song: string | null; artist: string | null; device_id?: string | null };
type EntryRow = { id: string; date: string; song: string; artist: string; genre: string | null; mood: string | null; device_id?: string | null };
type ListenLog = { id: string; created_at: string; device_id?: string | null };
type ViewLog  = { id: string; created_at: string; duration_seconds: number | null; exit_type: string | null; device_id?: string | null };
type LogRow = { id: string; created_at: string; device_id?: string | null };
type SaveLog = { id: string; created_at: string; entry_id: string; device_id: string };

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


const IMPORT_GENRES = [
  { value: "kpop", label: "K-POP" },
  { value: "pop", label: "팝" },
  { value: "hiphop", label: "힙합" },
  { value: "indie", label: "인디" },
  { value: "rnb", label: "R&B/소울" },
  { value: "acoustic_jazz", label: "어쿠스틱/재즈" },
];

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

function ConvCard({
  label, value, sub, accent = "#C4687A", tooltip,
}: {
  label: string; value: string; sub?: string; accent?: string; tooltip?: string;
}) {
  return (
    <div title={tooltip} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 18px", cursor: tooltip ? "help" : undefined }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 6 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1.1, display: "block" }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginTop: 4, display: "block" }}>{sub}</span>}
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
  icon, label, count, conv, isLast, userCount,
}: {
  icon: string; label: string; count: number; conv?: string; isLast?: boolean; userCount?: number;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 16px",
        background: "rgba(255,255,255,0.055)",
        borderRadius: 12,
      }}>
        <span style={{ fontSize: 15, width: 22, textAlign: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{label}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{count.toLocaleString()}회</span>
          {userCount != null && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>유저 {userCount.toLocaleString()}명</span>
          )}
        </div>
      </div>
      {!isLast && (
        <div style={{ display: "flex", alignItems: "center", padding: "2px 0 2px 26px", gap: 8 }}>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          {conv && conv !== "—" && (
            <span style={{ fontSize: 11, color: "#C4687A", fontWeight: 500 }}>↓ {conv}</span>
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
  const [pw, setPw] = useState("");
  const [toast, setToast] = useState("");
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
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [spotifyChecking, setSpotifyChecking] = useState(false);

  // ── 텍스트로 곡 추가 ──
  const [textSongs, setTextSongs] = useState("");
  const [textGenre, setTextGenre] = useState("auto");
  const [textLoading, setTextLoading] = useState(false);
  const [textProgress, setTextProgress] = useState<{ current: number; total: number } | null>(null);
  const [textResult, setTextResult] = useState<{ success: number; failed: string[]; duplicates?: { song: string; artist: string; existingGenre: string }[]; total: number; genreBreakdown?: Record<string, number> } | null>(null);
  const [textCooldown, setTextCooldown] = useState(0); // 남은 쿨다운 초
  const [textWaiting, setTextWaiting] = useState(false); // 30초 대기 중 표시

  // Spotify 429 카운트다운 — 조건부 return 전에 호출
  const retryTargetMs =
    spotifyStatus?.status === "rate_limited" && spotifyStatus.retryAfter
      ? spotifyStatus.checkedAt + spotifyStatus.retryAfter * 1000
      : null;
  const countdown = useCountdown(retryTargetMs);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [photoRes, prefRes, analyzeRes, entriesRes, shareRes, listenRes, viewRes, logRowsRes, saveRes] = await Promise.all([
      supabase.from("photo_upload_logs").select("id, created_at, device_id").order("created_at", { ascending: false }),
      supabase.from("preference_logs").select("id, created_at, genre, energy, device_id").order("created_at", { ascending: false }),
      supabase.from("analyze_logs").select("id, created_at, status, response_time_ms, song, artist, device_id").order("created_at", { ascending: false }),
      supabase.from("entries").select("id, date, song, artist, genre, mood, device_id").order("id", { ascending: false }),
      supabase.from("share_logs").select("id, created_at, device_id").order("created_at", { ascending: false }),
      supabase.from("listen_logs").select("id, created_at, device_id").order("created_at", { ascending: false }),
      supabase.from("result_view_logs").select("id, created_at, duration_seconds, exit_type, device_id").order("created_at", { ascending: false }),
      // share_views / try_click — RLS 우회 위해 supabaseAdmin 경유 서버 API 사용
      fetch("/api/admin/log-rows").then(r => r.json()) as Promise<{ shareViews: LogRow[]; tryClicks: LogRow[] }>,
      supabase.from("save_logs").select("id, created_at, entry_id, device_id").order("created_at", { ascending: false }),
    ]);

    if (!photoRes.error) setPhotoLogs(photoRes.data ?? []);
    if (!prefRes.error) setPrefLogs(prefRes.data ?? []);
    if (!analyzeRes.error) setAnalyzeLogs(analyzeRes.data ?? []);
    if (entriesRes.error) showToast("entries 로드 실패");
    else setEntries(entriesRes.data ?? []);
    if (!shareRes.error) setShareLogs(shareRes.data ?? []);
    else console.error("[admin] share_logs SELECT 실패:", shareRes.error.message);
    if (!listenRes.error) setListenLogs(listenRes.data ?? []);
    if (!viewRes.error) setViewLogs(viewRes.data ?? []);
    else console.error("[admin] result_view_logs 로드 실패:", viewRes.error.message);
    setShareViews(logRowsRes.shareViews ?? []);
    setTryClicks(logRowsRes.tryClicks ?? []);
    if (!saveRes.error) setSaveLogs(saveRes.data ?? []);
    else console.error("[admin] save_logs 로드 실패:", saveRes.error.message);

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  const checkSpotify = useCallback(async () => {
    setSpotifyChecking(true);
    try {
      const res = await fetch("/api/admin/spotify-status");
      const data = await res.json();
      setSpotifyStatus(data);
    } catch {
      setSpotifyStatus({ status: "token_failed", checkedAt: Date.now(), retryAfter: null });
    } finally {
      setSpotifyChecking(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchData();
    }
  }, [authed, fetchData]);

  const handleTextImport = async () => {
    if (!textSongs.trim()) { showToast("곡 목록을 입력해줘요"); return; }
    const lines = textSongs.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) { showToast("곡 목록이 비어있어요"); return; }

    setTextLoading(true);
    setTextResult(null);
    setTextWaiting(false);
    setTextProgress({ current: 0, total: lines.length });

    // 진행률 시뮬레이션 (1000ms 딜레이 + 30곡마다 30초 대기 반영)
    let simActive = true;
    let simCount = 0;

    const advanceSim = () => {
      if (!simActive) return;
      simCount++;
      setTextProgress({ current: Math.min(simCount, lines.length - 1), total: lines.length });

      if (simCount % 30 === 0 && simCount < lines.length) {
        // 30곡마다 30초 대기 표시
        setTextWaiting(true);
        setTimeout(() => {
          if (!simActive) return;
          setTextWaiting(false);
          setTimeout(advanceSim, 1000);
        }, 30000);
      } else if (simCount < lines.length - 1) {
        setTimeout(advanceSim, 1000);
      }
    };

    setTimeout(advanceSim, 1000);

    try {
      const res = await fetch("/api/admin/import-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songs: textSongs, genre: textGenre }),
      });
      const data = await res.json();
      simActive = false;
      setTextProgress(null);
      setTextWaiting(false);

      if (!res.ok) { showToast(data.error ?? "추가 실패"); return; }
      setTextResult(data);
      showToast(`${data.success}곡 저장 완료!`);
      // 60초 쿨다운 시작
      setTextCooldown(60);
      const cooldownInterval = setInterval(() => {
        setTextCooldown(prev => {
          if (prev <= 1) { clearInterval(cooldownInterval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      simActive = false;
      setTextProgress(null);
      setTextWaiting(false);
      showToast("네트워크 오류");
    } finally {
      setTextLoading(false);
    }
  };

  const handleLogin = () => {
    if (pw === ADMIN_PW) {
      setAuthed(true);
    } else {
      showToast("비밀번호가 틀렸어요");
      setPw("");
    }
  };

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
  const filteredPhotos  = photoLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredPrefs   = prefLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredAnalyze = analyzeLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredSaveLogs = saveLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredShares  = shareLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredListens = listenLogs.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredViews   = shareViews.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredTry     = tryClicks.filter(l => filterTs(l.created_at) && filterDevice(l));
  const filteredResultViews = viewLogs.filter(l => filterTs(l.created_at) && filterDevice(l));

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
  const d1Accent       = d1BaseCount < 5  ? C.gray : accentByRate(d1Rate, 20, 10);

  // D7 리텐션: 7일 전 신규 → 오늘 재방문
  const d7BaseDevices  = Object.entries(firstSeenMap).filter(([, fd]) => fd === sevenDaysAgo).map(([id]) => id);
  const d7Returned     = d7BaseDevices.filter(id => todayVisitors.has(id)).length;
  const d7BaseCount    = d7BaseDevices.length;
  const d7Rate         = d7BaseCount >= 5 ? pct(d7Returned, d7BaseCount) : "—";
  const d7Accent       = d7BaseCount < 5  ? C.gray : accentByRate(d7Rate, 10, 5);

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
  const completedTotal = successCount + failCount;
  const failRatePct = completedTotal > 0 ? (failCount / completedTotal) * 100 : null;
  const failRateStr = failRatePct != null ? failRatePct.toFixed(1) + "%" : "—";

  // ── 색상 계산 ──
  // CONVERSION
  const convSuccessAccent = accentByRate(userSuccessRate, 95, 80);
  const convListenAccent  = accentByRate(userListenRate,  30, 15);
  const convSaveAccent    = successUsers >= 10 ? accentByRate(userSaveRate,  15,  5) : C.gray;
  const convShareAccent   = successUsers >= 10 ? accentByRate(userShareRate, 10,  3) : C.gray;
  // PERFORMANCE
  const perfResponseAccent = avgResponseMs == null ? C.gray
    : avgResponseMs <= 8000  ? C.green
    : avgResponseMs <= 10000 ? C.yellow
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
  const perfOver30Accent  = rvGray ? C.gray : accentByRate(over30Pct,  40, 20);
  const perfUnder10Accent = rvGray ? C.gray : (() => {
    if (under10Pct === "—") return C.gray;
    const v = parseFloat(under10Pct);
    return v <= 20 ? C.green : v <= 40 ? C.yellow : C.red;
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
      .map(l => entryById[l.entry_id])
      .filter((e): e is EntryRow => !!e && !!e.song)
      .map(e => `${e.song}${e.artist ? ` — ${e.artist}` : ""}`)
  ).slice(0, 5);

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

      {/* ── 섹션: 유저 ── */}
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
              value={dau.toLocaleString()}
              sub={
                tab === "custom" && rangeDayCount > 1
                  ? `일평균 ${(dau / rangeDayCount).toFixed(1)}명`
                  : "분석 기준 활성 유저"
              }
              accent={C.white}
            />
            <ConvCard
              label="신규 유저"
              value={newUsers.toLocaleString()}
              sub={`전체 대비 ${pct(newUsers, dau)}`}
              accent={C.white}
              tooltip="해당 날짜에 처음 분석한 device_id"
            />
            <ConvCard
              label="재방문 유저"
              value={returnUsers.toLocaleString()}
              sub={`전체 대비 ${pct(returnUsers, dau)}`}
              accent={C.gray}
              tooltip="이전에도 분석한 적 있는 device_id"
            />
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

      {/* ── 섹션: 퍼널 흐름 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>FUNNEL</p>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 14px", marginBottom: 20 }}>
        <FunnelStep icon="📷" label="사진 업로드" count={photoCount} conv={pct(analyzeUsers, photoUsers)} userCount={photoUsers} />
        <FunnelStep icon="🎵" label="장르·에너지 선택" count={prefCount} conv={pct(analyzeUsers, analyzeUsers)} userCount={analyzeUsers} />
        <FunnelStep icon="✦" label="분석 시작" count={analyzeStartCount} conv={pct(successUsers, analyzeUsers)} userCount={analyzeUsers} />
        <FunnelStep icon="✓" label="분석 성공" count={successCount} conv={pct(listenUsers, successUsers)} userCount={successUsers} />
        <FunnelStep icon="▶" label="듣기 클릭" count={listenCount} conv={pct(saveUsers, listenUsers)} userCount={listenUsers} />
        <FunnelStep icon="💾" label="결과 저장" count={saveCount} conv={pct(shareCount, saveUsers)} userCount={saveUsers} />
        {shareCount > 0 ? (
          <>
            <FunnelStep icon="↑" label="공유하기" count={shareCount} conv={pct(viewCount, shareCount)} />
            <FunnelStep icon="👁" label="공유 페이지 조회" count={viewCount} conv={pct(tryCount, viewCount)} />
            <FunnelStep icon="→" label="나도 해보기 클릭" count={tryCount} isLast />
          </>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 16px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
          }}>
            <span style={{ fontSize: 15, width: 22, textAlign: "center", flexShrink: 0 }}>↑</span>
            <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>공유 지표</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
              공유 0 · 조회 0 · 나도해보기 0
            </span>
          </div>
        )}
      </div>

      {/* ── 섹션: 전환율 (유저 기준) ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>CONVERSION</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard label="분석 성공률" value={userSuccessRate} sub={`${successUsers}명 / ${analyzeUsers}명`} accent={convSuccessAccent} tooltip="분석 시작 유저 중 성공한 유저 비율" />
        <ConvCard label="듣기 클릭률" value={userListenRate} sub={`${listenUsers}명 / ${successUsers}명`} accent={convListenAccent} tooltip="AI 추천 만족도 지표 (유저 기준)" />
        <ConvCard label="저장률" value={userSaveRate} sub={`${saveUsers}명 / ${successUsers}명`} accent={convSaveAccent} tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "성공 유저 중 저장한 유저 비율"} />
        <ConvCard label="공유율" value={userShareRate} sub={`${filteredShares.length}건 / ${successUsers}명`} accent={convShareAccent} tooltip={successUsers < 10 ? "표본 10명 미만 — 판단 보류" : "성공 유저 대비 공유 건수"} />
        <ConvCard label="유입 전환율" value={pct(tryCount, viewCount)} sub={`${tryCount} / ${viewCount}`} accent={C.gray} tooltip="공유 페이지 조회 → 나도 해보기 클릭" />
      </div>

      {/* ── 섹션: 퍼포먼스 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>PERFORMANCE</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard
          label="평균 응답 시간"
          value={avgResponseMs != null ? (avgResponseMs >= 1000 ? `${(avgResponseMs / 1000).toFixed(1)}s` : `${avgResponseMs}ms`) : "—"}
          sub={`${completedLogs.length}건 기준`}
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
                {spotifyStatus.status === "rate_limited" && countdown && (
                  <p style={{ fontSize: 12, color: "#f07070", margin: 0 }}>초기화까지 {countdown}</p>
                )}
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
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>✏️ 텍스트로 곡 추가</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          <textarea
            value={textSongs}
            onChange={e => setTextSongs(e.target.value)}
            placeholder={"곡명 - 아티스트 (한 줄에 하나씩)\n예: Blueming - IU\nCherry Blossom Ending - Busker Busker"}
            rows={6}
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={textGenre}
              onChange={e => setTextGenre(e.target.value)}
              style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }}
            >
              <option value="auto" style={{ background: "#1a1a2e" }}>🤖 자동 분류 (AI)</option>
              {IMPORT_GENRES.map(g => (
                <option key={g.value} value={g.value} style={{ background: "#1a1a2e" }}>{g.label}</option>
              ))}
            </select>
            <button
              onClick={handleTextImport}
              disabled={textLoading || textCooldown > 0}
              style={{ background: (textLoading || textCooldown > 0) ? "rgba(255,255,255,0.06)" : "#5B8CFF", border: "none", borderRadius: 10, padding: "9px 20px", color: (textLoading || textCooldown > 0) ? "rgba(255,255,255,0.4)" : "#fff", fontSize: 13, fontWeight: 600, cursor: (textLoading || textCooldown > 0) ? "default" : "pointer", whiteSpace: "nowrap" }}
            >
              {textLoading ? "처리 중..." : textCooldown > 0 ? `${textCooldown}초 후 등록 가능` : "추가하기"}
            </button>
          </div>
        </div>

        {/* 진행 상태 */}
        {textProgress && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: textWaiting ? "#f0c060" : "rgba(255,255,255,0.6)", margin: "0 0 6px" }}>
              {textWaiting
                ? `⏸ ${textProgress.current}/${textProgress.total}곡 처리 후 30초 대기 중...`
                : `${textProgress.current}/${textProgress.total}곡 처리 중...`}
            </p>
            <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 4, overflow: "hidden" }}>
              <div style={{ background: textWaiting ? "#f0c060" : "#5B8CFF", height: "100%", width: `${Math.round((textProgress.current / textProgress.total) * 100)}%`, transition: "width 0.4s ease" }} />
            </div>
          </div>
        )}

        {/* 결과 */}
        {textResult && (
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ fontSize: 13, color: "#fff", margin: "0 0 6px", fontWeight: 600 }}>
              ✅ {textResult.success}곡 저장
              {(textResult.duplicates?.length ?? 0) > 0 && <span style={{ color: "#f0c060", fontWeight: 400, marginLeft: 8 }}>/ ⚠️ {textResult.duplicates!.length}곡 중복</span>}
              {textResult.failed.length > 0 && <span style={{ color: "#f07070", fontWeight: 400, marginLeft: 8 }}>/ ❌ {textResult.failed.length}곡 실패</span>}
            </p>
            {textResult.genreBreakdown && Object.keys(textResult.genreBreakdown).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {Object.entries(textResult.genreBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([g, count]) => (
                    <span key={g} style={{ background: "rgba(91,140,255,0.15)", border: "1px solid rgba(91,140,255,0.3)", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#8FB4FF" }}>
                      {g} {count}곡
                    </span>
                  ))}
              </div>
            )}
            {(textResult.duplicates?.length ?? 0) > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>⚠️ 중복 {textResult.duplicates!.length}곡 (기존 장르 유지):</p>
                {textResult.duplicates!.map((d, i) => (
                  <p key={i} style={{ fontSize: 12, color: "#f0c060", margin: "2px 0" }}>• {d.song} - {d.artist} → {d.existingGenre}</p>
                ))}
              </div>
            )}
            {textResult.failed.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>검색 실패한 곡:</p>
                {textResult.failed.map((f, i) => (
                  <p key={i} style={{ fontSize: 12, color: "#f07070", margin: "2px 0" }}>• {f}</p>
                ))}
              </div>
            )}
          </div>
        )}
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
