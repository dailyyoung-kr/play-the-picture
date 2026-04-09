"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PW = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "coldboardp1!";

type EntryRow = {
  id: string;
  date: string;
  song: string;
  artist: string;
  genre: string | null;
  mood: string | null;
};

type ShareLogRow = {
  id: string;
  created_at: string;
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

function countBy(arr: string[]): [string, number][] {
  const map: Record<string, number> = {};
  for (const k of arr) {
    if (k) map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function StatCard({
  label,
  value,
  sub,
  accent = "#fff",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span style={{ fontSize: 36, fontWeight: 700, color: accent, lineHeight: 1.2 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{sub}</span>
      )}
    </div>
  );
}

function RankList({
  title,
  items,
  accent = "#C4687A",
}: {
  title: string;
  items: [string, number][];
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>데이터 없음</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(([name, count], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: i === 0 ? accent : "rgba(255,255,255,0.3)",
                  width: 18,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    height: 3,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (count / (items[0][1] || 1)) * 100)}%`,
                      background: i === 0 ? accent : "rgba(255,255,255,0.25)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                {count}회
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [toast, setToast] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [shareLogs, setShareLogs] = useState<ShareLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [entriesRes, shareRes] = await Promise.all([
      supabase
        .from("entries")
        .select("id, date, song, artist, genre, mood")
        .order("id", { ascending: false }),
      supabase
        .from("share_logs")
        .select("id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (entriesRes.error) {
      showToast("entries 로드 실패");
    } else {
      setEntries(entriesRes.data ?? []);
    }

    if (!shareRes.error) {
      setShareLogs(shareRes.data ?? []);
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

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
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
          <p style={{ color: "#C4687A", fontSize: 13, letterSpacing: "0.15em", marginBottom: 28 }}>
            Play the Picture
          </p>
          <p style={{ color: "#fff", fontSize: 17, fontWeight: 600, marginBottom: 24 }}>
            관리자 대시보드
          </p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="비밀번호 입력"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 15,
              outline: "none",
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              background: "#C4687A",
              border: "none",
              borderRadius: 24,
              padding: "13px 0",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            입장하기
          </button>
        </div>

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(30,30,30,0.95)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: 13,
              padding: "10px 20px",
              borderRadius: 24,
              whiteSpace: "nowrap",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ── 지표 계산 ──
  const today = getTodayKST();

  const totalCount = entries.length;
  const todayCount = entries.filter((e) => e.date === today).length;

  const totalShares = shareLogs.length;
  const todayShares = shareLogs.filter(
    (s) => timestampToKSTDate(s.created_at) === today
  ).length;

  const topSongs = countBy(
    entries.map((e) => `${e.song}${e.artist ? ` — ${e.artist}` : ""}`)
  ).slice(0, 5);

  const topGenres = countBy(
    entries.map((e) => e.genre ?? "").filter(Boolean)
  ).slice(0, 3);

  const topMoods = countBy(
    entries.map((e) => e.mood ?? "").filter(Boolean)
  ).slice(0, 3);

  const refreshLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  // ── 대시보드 ──
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
        padding: "52px 20px 40px",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 28,
        }}
      >
        <div>
          <p style={{ color: "#C4687A", fontSize: 12, letterSpacing: "0.15em", marginBottom: 4 }}>
            Play the Picture
          </p>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>
            관리자 대시보드
          </h1>
          {refreshLabel && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>
              마지막 업데이트 {refreshLabel}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            background: loading ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 20,
            padding: "8px 16px",
            color: loading ? "rgba(255,255,255,0.35)" : "#fff",
            fontSize: 12,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "로딩 중..." : "↻ 새로고침"}
        </button>
      </div>

      {/* 저장 지표 카드 2개 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <StatCard label="전체 저장 횟수" value={totalCount} sub="누적 entries" />
        <StatCard label="오늘 저장 횟수" value={todayCount} sub={today} />
      </div>

      {/* 공유 지표 카드 2개 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <StatCard
          label="전체 공유 횟수"
          value={totalShares}
          sub="누적 share_logs"
          accent="#C4687A"
        />
        <StatCard
          label="오늘 공유 횟수"
          value={todayShares}
          sub={today}
          accent="#C4687A"
        />
      </div>

      {/* GA4 안내 섹션 */}
      <div
        style={{
          background: "rgba(196,104,122,0.08)",
          border: "1px solid rgba(196,104,122,0.2)",
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: 10,
        }}
      >
        <p style={{ color: "#C4687A", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          📊 GA4 이벤트 지표
        </p>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          analyze_start · result_view · spotify_click 등의 이벤트는
          Google Analytics 콘솔에서 확인할 수 있어요.
        </p>
      </div>

      {/* Top 5 곡 */}
      <div style={{ marginBottom: 10 }}>
        <RankList title="🎵 가장 많이 추천된 곡 Top 5" items={topSongs} accent="#C4687A" />
      </div>

      {/* Top 3 장르 + Top 3 기분 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <RankList title="🎸 선택 장르 Top 3" items={topGenres} accent="#a0d4f0" />
        <RankList title="🌤 선택 기분 Top 3" items={topMoods} accent="#a0f0b0" />
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(30,30,30,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 13,
            padding: "10px 20px",
            borderRadius: 24,
            whiteSpace: "nowrap",
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
