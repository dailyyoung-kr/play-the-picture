"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PW = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "coldboardp1!";

type PhotoLog = { id: string; created_at: string };
type PrefLog = { id: string; created_at: string; genre: string | null; mood: string | null; listening_style: string | null };
type AnalyzeLog = { id: string; created_at: string; status: string; response_time_ms: number | null; spotify_status: string | null; song: string | null; artist: string | null };
type EntryRow = { id: string; date: string; song: string; artist: string; genre: string | null; mood: string | null };
type LogRow = { id: string; created_at: string };
type FailLog = { id: string; created_at: string; song: string | null; artist: string | null; error_reason: string | null };
type SpotifyStatus = {
  status: "ok" | "rate_limited" | "token_failed";
  checkedAt: number;
  retryAfter: number | null;
};

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

const GENRES = ["인디", "팝", "K-POP", "힙합/R&B", "재즈/어쿠스틱", "장르 발견하기"];
const MOODS = ["신나", "설레", "여유로워", "복잡해", "지쳐"];
const STYLES = ["출근/등교길", "작업/공부", "데이트", "휴식", "산책/드라이브", "잠들기 전"];

function countBy(arr: string[]): [string, number][] {
  const map: Record<string, number> = {};
  for (const k of arr) {
    if (k) map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function fillRank(arr: string[], fixed: string[]): [string, number][] {
  const map: Record<string, number> = Object.fromEntries(countBy(arr));
  return fixed.map(k => [k, map[k] ?? 0] as [string, number]).sort((a, b) => b[1] - a[1]);
}

function pct(a: number, b: number): string {
  if (b === 0) return "—";
  return ((a / b) * 100).toFixed(1) + "%";
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
  label, value, sub, accent = "#C4687A",
}: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 18px" }}>
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
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px" }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>데이터 없음</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(([name, count], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? accent : "rgba(255,255,255,0.3)", width: 18, flexShrink: 0, textAlign: "right" }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </div>
                <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (count / (items[0][1] || 1)) * 100)}%`, background: i === 0 ? accent : "rgba(255,255,255,0.25)", borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{count}회</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelStep({
  icon, label, count, conv, isLast,
}: {
  icon: string; label: string; count: number; conv?: string; isLast?: boolean;
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
        <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{count.toLocaleString()}</span>
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
  const [tab, setTab] = useState<"today" | "all">("today");

  const [photoLogs, setPhotoLogs] = useState<PhotoLog[]>([]);
  const [prefLogs, setPrefLogs] = useState<PrefLog[]>([]);
  const [analyzeLogs, setAnalyzeLogs] = useState<AnalyzeLog[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [shareLogs, setShareLogs] = useState<LogRow[]>([]);
  const [shareViews, setShareViews] = useState<LogRow[]>([]);
  const [tryClicks, setTryClicks] = useState<LogRow[]>([]);
  const [failLogs, setFailLogs] = useState<FailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [spotifyChecking, setSpotifyChecking] = useState(false);

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
    const [photoRes, prefRes, analyzeRes, entriesRes, shareRes, viewsRes, tryRes, failRes] = await Promise.all([
      supabase.from("photo_upload_logs").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("preference_logs").select("id, created_at, genre, mood, listening_style").order("created_at", { ascending: false }),
      supabase.from("analyze_logs").select("id, created_at, status, response_time_ms, spotify_status, song, artist").order("created_at", { ascending: false }),
      supabase.from("entries").select("id, date, song, artist, genre, mood").order("id", { ascending: false }),
      supabase.from("share_logs").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("share_views").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("try_click").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("analyze_logs").select("id, created_at, song, artist, error_reason").eq("spotify_status", "not_found").order("created_at", { ascending: false }).limit(5),
    ]);

    if (!photoRes.error) setPhotoLogs(photoRes.data ?? []);
    if (!prefRes.error) setPrefLogs(prefRes.data ?? []);
    if (!analyzeRes.error) setAnalyzeLogs(analyzeRes.data ?? []);
    if (entriesRes.error) showToast("entries 로드 실패");
    else setEntries(entriesRes.data ?? []);
    if (!shareRes.error) setShareLogs(shareRes.data ?? []);
    if (!viewsRes.error) setShareViews(viewsRes.data ?? []);
    if (!tryRes.error) setTryClicks(tryRes.data ?? []);
    if (!failRes.error) setFailLogs((failRes.data ?? []) as FailLog[]);

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
      checkSpotify();
    }
  }, [authed, fetchData, checkSpotify]);

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
  const filterTs = (ts: string) => tab === "today" ? timestampToKSTDate(ts) === today : true;

  const filteredPhotos = photoLogs.filter(l => filterTs(l.created_at));
  const filteredPrefs = prefLogs.filter(l => filterTs(l.created_at));
  const filteredAnalyze = analyzeLogs.filter(l => filterTs(l.created_at));
  const filteredEntries = tab === "today" ? entries.filter(e => e.date === today) : entries;
  const filteredShares = shareLogs.filter(l => filterTs(l.created_at));
  const filteredViews = shareViews.filter(l => filterTs(l.created_at));
  const filteredTry = tryClicks.filter(l => filterTs(l.created_at));

  // ── 퍼널 수치 ──
  const photoCount = filteredPhotos.length;
  const prefCount = filteredPrefs.length;
  const analyzeStartCount = filteredAnalyze.length; // 모든 analyze_log = 분석 시작 횟수
  const successCount = filteredAnalyze.filter(l => l.status === "success").length;
  const failCount = filteredAnalyze.filter(l => l.status === "fail").length;
  const saveCount = filteredEntries.length;
  const shareCount = filteredShares.length;
  const viewCount = filteredViews.length;
  const tryCount = filteredTry.length;

  // ── 퍼포먼스 ──
  const completedLogs = filteredAnalyze.filter(l => (l.status === "success" || l.status === "fail") && l.response_time_ms != null);
  const avgResponseMs = completedLogs.length > 0
    ? Math.round(completedLogs.reduce((sum, l) => sum + (l.response_time_ms ?? 0), 0) / completedLogs.length)
    : null;
  const completedTotal = successCount + failCount;
  const failRateStr = completedTotal > 0 ? ((failCount / completedTotal) * 100).toFixed(1) + "%" : "—";

  // ── 콘텐츠 인사이트 ──
  const topGenres = fillRank(filteredPrefs.map(l => l.genre ?? "").filter(Boolean), GENRES);
  const topMoods = fillRank(filteredPrefs.map(l => l.mood ?? "").filter(Boolean), MOODS);
  const topStyles = fillRank(filteredPrefs.map(l => l.listening_style ?? "").filter(Boolean), STYLES);
  const topSongs = countBy(
    filteredAnalyze
      .filter(l => l.status === "success" && l.song)
      .map(l => `${l.song}${l.artist ? ` — ${l.artist}` : ""}`)
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

      {/* TODAY / 전체 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {(["today", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 18px",
              borderRadius: 20,
              border: tab === t ? "none" : "1px solid rgba(255,255,255,0.15)",
              background: tab === t ? "#C4687A" : "transparent",
              color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {t === "today" ? "오늘" : "전체"}
          </button>
        ))}
        <span style={{ alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>
          {tab === "today" ? today : "누적"}
        </span>
      </div>

      {/* ── 섹션: 퍼널 흐름 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>FUNNEL</p>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 14px", marginBottom: 20 }}>
        <FunnelStep icon="📷" label="사진 업로드" count={photoCount} conv={pct(prefCount, photoCount)} />
        <FunnelStep icon="🎵" label="취향 선택" count={prefCount} conv={pct(analyzeStartCount, prefCount)} />
        <FunnelStep icon="✦" label="분석 시작" count={analyzeStartCount} conv={pct(successCount, analyzeStartCount)} />
        <FunnelStep icon="✓" label="분석 성공" count={successCount} conv={pct(saveCount, successCount)} />
        <FunnelStep icon="💾" label="결과 저장" count={saveCount} conv={pct(shareCount, saveCount)} />
        <FunnelStep icon="↑" label="공유하기" count={shareCount} conv={pct(viewCount, shareCount)} />
        <FunnelStep icon="👁" label="공유 페이지 조회" count={viewCount} conv={pct(tryCount, viewCount)} />
        <FunnelStep icon="→" label="나도 해보기 클릭" count={tryCount} isLast />
      </div>

      {/* ── 섹션: 핵심 전환율 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>CONVERSION</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard label="분석 성공률" value={pct(successCount, analyzeStartCount)} sub={`${successCount} / ${analyzeStartCount}`} accent="#6be0a0" />
        <ConvCard label="저장 전환율" value={pct(saveCount, successCount)} sub={`${saveCount} / ${successCount}`} accent="#a0d4f0" />
        <ConvCard label="공유율" value={pct(shareCount, saveCount)} sub={`${shareCount} / ${saveCount}`} accent="#C4687A" />
        <ConvCard label="유입 전환율" value={pct(tryCount, viewCount)} sub={`${tryCount} / ${viewCount}`} accent="#f0d080" />
      </div>

      {/* ── 섹션: 퍼포먼스 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>PERFORMANCE</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <ConvCard
          label="평균 응답 시간"
          value={avgResponseMs != null ? (avgResponseMs >= 1000 ? `${(avgResponseMs / 1000).toFixed(1)}s` : `${avgResponseMs}ms`) : "—"}
          sub={`${completedLogs.length}건 기준`}
          accent="#fff"
        />
        <ConvCard label="분석 실패율" value={failRateStr} sub={`실패 ${failCount}건`} accent={failCount > 0 ? "#f07070" : "#6be0a0"} />
      </div>

      {/* ── 섹션: 콘텐츠 인사이트 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>CONTENT</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <RankList title="🎸 장르 선택 순위" items={topGenres} accent="#a0d4f0" />
        <RankList title="🌤 기분 선택 순위" items={topMoods} accent="#a0f0b0" />
      </div>
      <div style={{ marginBottom: 8 }}>
        <RankList title="🚶 상황 선택 순위" items={topStyles} accent="#f0c080" />
      </div>
      <div style={{ marginBottom: 8 }}>
        <RankList title="🎵 추천된 곡 Top 5" items={topSongs} accent="#C4687A" />
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>❌ 검증 실패한 곡 목록</p>
          <span style={{ background: "rgba(240,112,112,0.15)", border: "1px solid rgba(240,112,112,0.3)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#f07070", fontWeight: 600 }}>
            총 {analyzeLogs.filter(l => l.spotify_status === "not_found").length}회
          </span>
        </div>
        {failLogs.length === 0 ? (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>실패 기록 없음</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {failLogs.map((log) => (
              <div key={log.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#fff", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.song ? `${log.song}${log.artist ? ` — ${log.artist}` : ""}` : "곡명 없음"}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {timestampToKSTShort(log.created_at)}
                  </span>
                </div>
                {log.error_reason && (
                  <p style={{ fontSize: 11, color: "#f07070", margin: "4px 0 0", opacity: 0.8 }}>{log.error_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 섹션: Spotify API 상태 ── */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 10 }}>SPOTIFY</p>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: 0 }}>🎵 Spotify API 상태</p>
          <button
            onClick={checkSpotify}
            disabled={spotifyChecking}
            style={{ background: spotifyChecking ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "5px 12px", color: spotifyChecking ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 11, cursor: spotifyChecking ? "default" : "pointer" }}
          >
            {spotifyChecking ? "확인 중..." : "지금 확인"}
          </button>
        </div>
        {!spotifyStatus && !spotifyChecking && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>확인 전</p>
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

      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, padding: "10px 20px", borderRadius: 24, whiteSpace: "nowrap", zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
