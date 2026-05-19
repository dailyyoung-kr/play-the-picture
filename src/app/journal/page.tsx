"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseWithDeviceId, Entry } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Archive, Music, ChevronDown, X } from "lucide-react";
import { getDeviceId } from "@/lib/device";
import { HamburgerMenu } from "@/components/header/HamburgerMenu";
import { PreviewPlayer } from "@/components/PreviewPlayer";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// KST 기준 오늘 정보 — toISOString()은 UTC 기준이라 한국 새벽(00~09시)에는 어제 날짜 반환 버그.
// Intl.DateTimeFormat으로 KST 직접 추출 후 KST 자정 Date 생성.
function getTodayKST(): {
  year: number;
  month: number;
  day: number;
  iso: string;
  date: Date;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00+09:00`);
  return { year, month, day, iso, date };
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(isoString: string) {
  const d = new Date(isoString);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}:${m}`;
}

// 캘린더 날짜용 — 기록 있는 날 표시 (작은 라벤더 8분음표)
function EntryNote() {
  return (
    <svg width="14" height="16" viewBox="0 0 24 24" style={{ display: "block" }}>
      <g fill="#5D4F8C">
        <ellipse cx="7.5" cy="17.5" rx="4" ry="3.1" transform="rotate(-18 7.5 17.5)" />
        <rect x="10.5" y="4" width="2" height="13.5" />
        <path d="M12.5 4 Q 17.2 5.6 16.6 10.2 Q 15.2 7 12.5 6 Z" />
      </g>
    </svg>
  );
}

export default function JournalPage() {
  const router = useRouter();
  const [todayKST] = useState(getTodayKST);
  const today = todayKST.date;
  const [currentYear, setCurrentYear] = useState(todayKST.year);
  const [currentMonth, setCurrentMonth] = useState(todayKST.month);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKST.iso);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [toast, setToast] = useState("");
  const [showListenSheet, setShowListenSheet] = useState(false);
  const [listeningEntry, setListeningEntry] = useState<Entry | null>(null);
  const [musicLinks, setMusicLinks] = useState<{
    spotifyUrl: string | null;
    youtubeUrl: string | null;
    appleMusicUrl: string | null;
    spotifyFallback: string;
    youtubeFallback: string;
  } | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [weekStartDate, setWeekStartDate] = useState(() => getMondayOf(todayKST.date));
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const calendarTouchStartX = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  };

  const handleListenClick = (entry: Entry) => {
    setListeningEntry(entry);
    setMusicLinks(null);
    setShowListenSheet(true);
    setLoadingLinks(true);
    // Spotify·YouTube는 /api/music-search, Apple Music은 /api/itunes-preview에서 trackViewUrl 가져옴
    const musicParams = new URLSearchParams({ song: entry.song, artist: entry.artist });
    const itunesParams = new URLSearchParams({ title: entry.song, artist: entry.artist });
    Promise.all([
      fetch(`/api/music-search?${musicParams}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/itunes-preview?${itunesParams}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([musicData, itunesData]) => {
        if (!musicData) {
          setMusicLinks(null);
          return;
        }
        setMusicLinks({
          ...musicData,
          appleMusicUrl: itunesData?.trackViewUrl ?? null,
        });
      })
      .finally(() => setLoadingLinks(false));
  };

  const prevWeek = () => setWeekStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeekStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });

  const handleCalendarSwipeStart = (e: React.TouchEvent) => { calendarTouchStartX.current = e.touches[0].clientX; };
  const handleCalendarSwipeEnd = (e: React.TouchEvent) => {
    const diff = calendarTouchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50) { if (calendarView === "week") nextWeek(); else nextMonth(); }
    else if (diff < -50) { if (calendarView === "week") prevWeek(); else prevMonth(); }
  };

  const handleViewToggle = () => {
    if (calendarView === "week") {
      setCurrentYear(weekStartDate.getFullYear());
      setCurrentMonth(weekStartDate.getMonth());
    } else {
      const refDate = selectedDate ? new Date(selectedDate + "T00:00:00") : today;
      setWeekStartDate(getMondayOf(refDate));
    }
    setCalendarView(v => v === "week" ? "month" : "week");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const deviceId = getDeviceId();
    const res = await fetch(`/api/entries/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "x-device-id": deviceId },
    });
    if (res.ok) {
      setEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
      if (selectedEntry?.id === deleteTarget.id) setSelectedEntry(null);
      showToast("기록이 삭제됐어요");
    } else {
      showToast("삭제에 실패했어요. 다시 시도해주세요.");
    }
    setDeleteTarget(null);
  };

  useEffect(() => {
    let from: string, to: string;
    if (calendarView === "week") {
      const weekEnd = new Date(weekStartDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      from = toDateStr(weekStartDate);
      to = toDateStr(weekEnd);
    } else {
      from = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      to = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
    const currentDeviceId = getDeviceId();
    (async () => {
      // 1) 로그인 user 확인 → device_ids 결정
      // - 로그인 (anon 또는 google): profiles.device_ids 누적 (cross-device 자동 지원)
      // - 비로그인 (pure guest): 현재 device_id만
      const authClient = createSupabaseBrowserClient();
      const { data: { user } } = await authClient.auth.getUser();

      let deviceIds: string[];
      if (user) {
        const { data: profile } = await authClient
          .from("profiles")
          .select("device_ids")
          .eq("id", user.id)
          .single();
        const profileDeviceIds = (profile?.device_ids as string[] | null) ?? [];
        // 현재 device_id가 누락된 경우(예: cross-device 직접 진입) 포함
        deviceIds = profileDeviceIds.includes(currentDeviceId)
          ? profileDeviceIds
          : [...profileDeviceIds, currentDeviceId];
      } else {
        deviceIds = [currentDeviceId];
      }

      const supabase = getSupabaseWithDeviceId();
      // 2) 해당 device_id들의 save_logs 조회 → entry_id 목록
      const { data: savedRows } = await supabase
        .from("save_logs")
        .select("entry_id")
        .in("device_id", deviceIds);
      const savedIds = (savedRows ?? []).map((r: { entry_id: string }) => r.entry_id);
      if (savedIds.length === 0) {
        setEntries([]);
        return;
      }
      // 3) 해당 entry들 중 날짜 범위에 걸치는 것만 로드
      const { data } = await supabase
        .from("entries")
        .select("*")
        .in("id", savedIds)
        .gte("date", from)
        .lte("date", to)
        .order("created_at", { ascending: false });
      setEntries(data ?? []);
    })();
  }, [calendarView, weekStartDate, currentYear, currentMonth]);

  const todayStr = todayKST.iso; // KST 기준 오늘 (today.toISOString()은 UTC라 새벽 시각 버그)

  // 주간 뷰 날짜 7개 (월~일)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const weekNum = Math.ceil(weekStart.getDate() / 7);
  const weekLabel = `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekNum}주차`;

  // 날짜별 entries 맵
  const entriesByDate: Record<string, Entry[]> = {};
  entries.forEach((e) => {
    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
    entriesByDate[e.date].push(e);
  });

  // 선택된 날짜의 entries (최신순)
  const selectedEntries = selectedDate ? (entriesByDate[selectedDate] ?? []) : [];

  // 캘린더 계산
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calendarCells = Array(firstDayOfMonth).fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
    else setCurrentMonth(m => m + 1);
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
  };

  const selectedDateLabel = selectedDate
    ? `${parseInt(selectedDate.slice(5, 7))}월 ${parseInt(selectedDate.slice(8, 10))}일`
    : "";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(180deg, #c5beda 0%, #b3acd2 45%, #c8c0e0 100%)", position: "relative" }}
    >
      <HamburgerMenu />

      {/* 상단 앱 로고 — 랜딩 페이지와 동일 */}
      <div className="flex justify-center" style={{ paddingTop: 12, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/play-the-picture-logo-one-line.png"
          alt="Play the Picture"
          onClick={() => router.push("/")}
          style={{ height: 48, width: "auto", cursor: "pointer" }}
        />
      </div>

      {/* 주차/월 라벨 + 펼치기 토글 — 좌우 스와이프로 주차·월 이동 */}
      <div
        className="flex items-center justify-center px-5 py-3"
        style={{ gap: 6 }}
        onTouchStart={handleCalendarSwipeStart}
        onTouchEnd={handleCalendarSwipeEnd}
      >
        <span className="font-semibold" style={{ fontSize: 15, color: "#2e2547" }}>
          {calendarView === "week" ? weekLabel : `${currentYear}년 ${currentMonth + 1}월`}
        </span>
        <button
          onClick={handleViewToggle}
          aria-label={calendarView === "week" ? "월간 보기" : "주간 보기"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(93,79,140,0.1)", border: "none", borderRadius: 8,
            width: 24, height: 24, cursor: "pointer", color: "#5D4F8C", flexShrink: 0,
          }}
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            style={{ transform: calendarView === "month" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          />
        </button>
      </div>

      {calendarView === "week" ? (
        /* ── 주간 뷰 ── */
        <div
          onTouchStart={handleCalendarSwipeStart}
          onTouchEnd={handleCalendarSwipeEnd}
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 12px", marginBottom: 8 }}
        >
          {weekDays.map((date, i) => {
            const dateStr = toDateStr(date);
            const dayEntries = entriesByDate[dateStr] ?? [];
            const hasEntry = dayEntries.length > 0;
            const entryCount = dayEntries.length;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const isSunday = i === 6;
            const isSaturday = i === 5;

            return (
              <button
                key={dateStr}
                onClick={() => handleDateClick(dateStr)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
              >
                {/* 요일 */}
                <span style={{ fontSize: 10, color: isSunday ? "#cf5a6e" : isSaturday ? "#5a7fc0" : "rgba(46,37,71,0.45)" }}>
                  {WEEK_DAYS[i]}
                </span>
                {/* 기록 있는 날 — 작은 라벤더 8분음표 (없으면 정렬용 placeholder) */}
                {entryCount >= 1 ? (
                  <EntryNote />
                ) : (
                  <span style={{ height: 16 }} />
                )}
                {/* 원형 날짜 */}
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isSelected ? "#5D4F8C" : hasEntry ? "rgba(93,79,140,0.18)" : "transparent",
                  border: isSelected ? "none"
                    : isToday ? "1.5px solid rgba(93,79,140,0.55)"
                    : hasEntry ? "1.5px solid rgba(93,79,140,0.45)"
                    : "1px solid rgba(93,79,140,0.2)",
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: hasEntry || isSelected ? 600 : 400,
                    color: isSelected ? "#fff"
                      : hasEntry ? "#2e2547"
                      : isSunday ? "#cf5a6e"
                      : isSaturday ? "#5a7fc0"
                      : "rgba(46,37,71,0.5)",
                  }}>
                    {date.getDate()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* ── 월간 뷰 ── */
        <>
          {/* 요일 헤더 */}
          <div className="px-4" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DAYS.map((d, i) => (
              <div key={d} className="text-center" style={{
                fontSize: 10,
                color: i === 0 ? "#cf5a6e" : i === 6 ? "#5a7fc0" : "rgba(46,37,71,0.4)",
                padding: "3px 0",
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 — 좌우 스와이프로 월 이동 */}
          <div
            className="px-4 mb-3"
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}
            onTouchStart={handleCalendarSwipeStart}
            onTouchEnd={handleCalendarSwipeEnd}
          >
            {calendarCells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEntries = entriesByDate[dateStr] ?? [];
              const hasEntry = dayEntries.length > 0;
              const entryCount = dayEntries.length;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const isSunday = (i % 7) === 0;
              const isSaturday = (i % 7) === 6;

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDateClick(dateStr)}
                  style={{
                    padding: "6px 0 4px",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    background: "transparent",
                    border: "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {/* 원형 날짜 */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isSelected ? "#5D4F8C" : hasEntry ? "rgba(93,79,140,0.18)" : "transparent",
                    border: isSelected ? "none"
                      : isToday ? "1.5px solid rgba(93,79,140,0.5)"
                      : hasEntry ? "1.5px solid rgba(93,79,140,0.4)"
                      : "1.5px solid rgba(93,79,140,0.12)",
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: hasEntry || isSelected ? 600 : 400,
                      color: isSelected ? "#fff"
                        : hasEntry ? "#2e2547"
                        : isSunday ? "#cf5a6e"
                        : isSaturday ? "#5a7fc0"
                        : "rgba(46,37,71,0.5)",
                    }}>
                      {day}
                    </span>
                  </div>
                  {/* 기록 개수 — 2개 이상일 때만 */}
                  {entryCount >= 2 && (
                    <span style={{ fontSize: 8, color: "#5D4F8C", lineHeight: 1 }}>
                      {entryCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 구분선 */}
      <div style={{ height: "0.5px", background: "rgba(46,37,71,0.12)", margin: "0 0 16px" }} />

      {/* 선택된 날짜 기록 목록 */}
      <div className="flex-1 px-5 overflow-y-auto" style={{ paddingTop: 16 }}>
        {selectedDate && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold" style={{ fontSize: 14, color: "#2e2547" }}>
                {selectedDateLabel}
              </span>
              {selectedEntries.length > 0 && (
                <span style={{ fontSize: 12, color: "rgba(46,37,71,0.5)" }}>
                  기록 {selectedEntries.length}개
                </span>
              )}
            </div>

            {selectedEntries.length === 0 && (
              <p style={{ fontSize: 13, color: "rgba(46,37,71,0.4)", textAlign: "center", marginTop: 24, marginBottom: 8 }}>
                이 날의 기록이 없어요
              </p>
            )}
            {selectedEntries.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedEntries.map((entry) => {
                  const photos = entry.photos ?? [];
                  return (
                    <div
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        background: "rgba(255,255,255,0.55)",
                        border: "1px solid rgba(93,79,140,0.18)",
                        borderRadius: 16,
                        padding: 12,
                        cursor: "pointer",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      {/* 사진 썸네일 — 대표 1장 + 장수 뱃지 */}
                      <div style={{ position: "relative", width: 104, height: 104, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "rgba(93,79,140,0.08)" }}>
                        {photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photos[0]} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 28, opacity: 0.4, color: "#5D4F8C" }}>♪</span>
                          </div>
                        )}
                        {photos.length > 1 && (
                          <div style={{
                            position: "absolute", top: 6, right: 6,
                            background: "rgba(46,37,71,0.6)",
                            borderRadius: 8, padding: "2px 7px",
                            fontSize: 10, color: "#fff", fontWeight: 500,
                            pointerEvents: "none",
                          }}>
                            {photos.length}장
                          </div>
                        )}
                      </div>

                      {/* 정보 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 12.5, color: "rgba(46,37,71,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 6 }}>
                            {entry.vibe_type ?? ""}
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(46,37,71,0.4)", flexShrink: 0 }}>
                            {formatTime(entry.created_at)}
                          </span>
                        </div>
                        <p style={{ fontWeight: 700, fontSize: 17, color: "#2e2547", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.song}
                        </p>
                        <p style={{ fontSize: 13.5, color: "rgba(46,37,71,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.artist}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA: 노래 추천받기 */}
            <button
              onClick={() => router.push("/")}
              style={{
                width: "100%",
                marginTop: 10,
                background: "rgba(255,255,255,0.4)",
                border: "1px dashed rgba(93,79,140,0.35)",
                borderRadius: 14,
                padding: 16,
                textAlign: "center",
                cursor: "pointer",
                color: "rgba(46,37,71,0.6)",
                fontSize: 14,
              }}
            >
              새로운 노래 찾으러 가기 →
            </button>
          </>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
          background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 13, padding: "10px 20px", borderRadius: 24,
          zIndex: 200, whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px" }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "linear-gradient(180deg, #c8c1e2 0%, #c2bade 100%)", borderRadius: 18, padding: "24px 20px", width: "100%", border: "1px solid rgba(93,79,140,0.2)", boxShadow: "0 20px 60px rgba(46,37,71,0.3)" }}
          >
            <p className="font-semibold text-center" style={{ fontSize: 15, color: "#2e2547", marginBottom: 8 }}>
              이 기록을 삭제할까요?
            </p>
            <p className="text-center" style={{ fontSize: 12, color: "rgba(46,37,71,0.5)", marginBottom: 20 }}>
              {deleteTarget.song} · {formatTime(deleteTarget.created_at)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, background: "transparent", border: "1px solid rgba(93,79,140,0.3)", color: "rgba(46,37,71,0.65)", fontSize: 14, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                style={{ flex: 1, padding: "12px", borderRadius: 12, background: "rgba(220,60,60,0.85)", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 */}
      <div style={{ background: "rgba(255,255,255,0.7)", borderTop: "0.5px solid rgba(46,37,71,0.12)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px", flexShrink: 0 }}>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#2e2547", cursor: "pointer" }} onClick={() => router.push("/journal")}>
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(46,37,71,0.55)", cursor: "pointer" }} onClick={() => router.push("/")}>
          <Music size={22} strokeWidth={1.5} />
          노래 추천받기
        </div>
      </div>

      {/* 상세 모달 */}
      {selectedEntry && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50, overflowY: "auto" }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ margin: "40px 16px 40px", background: "linear-gradient(180deg, #c8c1e2 0%, #c2bade 100%)", borderRadius: 20, padding: "20px 16px", border: "1px solid rgba(93,79,140,0.2)" }}
          >
            <div className="flex justify-between items-center mb-4">
              <span style={{ fontSize: 12, color: "rgba(46,37,71,0.5)" }}>
                {selectedEntry.date} · {formatTime(selectedEntry.created_at)}
              </span>
              <button onClick={() => setSelectedEntry(null)} style={{ background: "none", border: "none", color: "#5D4F8C", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {/* 섹션 1: 사진 */}
            {selectedEntry.photos?.length > 0 && (() => {
              const count = selectedEntry.photos.length;
              const slotSize = count === 1 ? 110 : count === 2 ? 95 : count === 3 ? 80 : count === 4 ? 72 : 64;
              const gap = count <= 3 ? 6 : 5;
              return (
                <div style={{ display: "flex", gap, justifyContent: "center", flexWrap: "nowrap", marginBottom: 12 }}>
                  {selectedEntry.photos.map((src, i) => (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setModalIndex(i); }}
                      style={{ width: slotSize, height: slotSize, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(93,79,140,0.18)", flexShrink: 0, cursor: "pointer" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 섹션 2: 오늘의 당신은 */}
            {selectedEntry.vibe_type && (
              <div style={{
                width: "100%", marginBottom: 10,
                background: "rgba(255,255,255,0.55)", border: "1px solid rgba(93,79,140,0.18)",
                borderRadius: 14, padding: "12px 14px",
                textAlign: "center",
              }}>
                <p style={{ fontSize: 10, color: "rgba(46,37,71,0.55)", marginBottom: 5 }}>오늘의 당신은</p>
                <p className="font-medium" style={{ fontSize: 16, color: "#2e2547", marginBottom: 5, lineHeight: 1.35 }}>
                  {selectedEntry.vibe_type}
                </p>
                {selectedEntry.vibe_description && (
                  <p style={{ fontSize: 11, color: "rgba(46,37,71,0.6)", lineHeight: 1.5 }}>
                    {selectedEntry.vibe_description}
                  </p>
                )}
              </div>
            )}

            {/* 섹션 4: 곡 정보 */}
            <div style={{ marginBottom: 10, textAlign: "center" }}>
              <h2 className="font-semibold" style={{ fontSize: 22, color: "#2e2547", letterSpacing: "-0.5px", marginBottom: 4 }}>
                {selectedEntry.song}
              </h2>
              <p style={{ fontSize: 13, color: "rgba(46,37,71,0.55)", marginBottom: 8 }}>
                {selectedEntry.artist}
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                {selectedEntry.tags?.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(93,79,140,0.3)", color: "rgba(46,37,71,0.7)" }}>
                    #{tag.replace(/^#+/, "")}
                  </span>
                ))}
              </div>
            </div>

            {/* 섹션 4-b: 30초 미리듣기 — iTunes URL 있을 때만 표시 (컴포넌트 내부에서 처리) */}
            <PreviewPlayer
              song={selectedEntry.song}
              artist={selectedEntry.artist}
              pageContext="journal"
            />

            {/* 섹션 5: 플더픽이 추천한 이유 */}
            <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(93,79,140,0.18)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
              <p className="font-medium" style={{ fontSize: 10, color: "#5D4F8C", letterSpacing: "0.05em", marginBottom: 6 }}>
                플더픽이 추천한 이유
              </p>
              <p style={{ fontSize: 12, color: "rgba(46,37,71,0.7)", lineHeight: 1.8 }}>{selectedEntry.reason}</p>
            </div>

            {/* 음악앱에서 듣기 — result 페이지와 라벨 통일 */}
            <button
              onClick={() => handleListenClick(selectedEntry)}
              style={{
                width: "100%", background: "#5D4F8C", border: "none",
                borderRadius: 24, padding: 14,
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ▶  음악앱에서 듣기
            </button>

            {/* 기록 삭제 */}
            <p
              onClick={() => setDeleteTarget(selectedEntry)}
              style={{
                textAlign: "center", fontSize: 12,
                color: "rgba(46,37,71,0.45)",
                marginTop: 12, cursor: "pointer",
              }}
            >
              기록 삭제하기
            </p>
          </div>
        </div>
      )}

      {/* 듣기 바텀시트 */}
      {showListenSheet && listeningEntry && (() => {
        const platforms = [
          {
            name: "Apple Music에서 듣기",
            url: musicLinks?.appleMusicUrl
              ?? `https://music.apple.com/kr/search?term=${encodeURIComponent(`${listeningEntry.song} ${listeningEntry.artist}`)}`,
            isDirect: !!musicLinks?.appleMusicUrl,
            iconImage: "/badges/apple-music-icon.svg",
          },
          {
            name: "YouTube Music에서 듣기",
            url: musicLinks?.youtubeUrl ?? musicLinks?.youtubeFallback ?? `https://music.youtube.com/search?q=${encodeURIComponent(`${listeningEntry.song} ${listeningEntry.artist}`)}`,
            isDirect: !!musicLinks?.youtubeUrl,
            iconImage: "/badges/youtube-music-icon.svg",
          },
          {
            name: "Spotify에서 듣기",
            url: musicLinks?.spotifyUrl ?? musicLinks?.spotifyFallback ?? `https://open.spotify.com/search/${encodeURIComponent(`${listeningEntry.song} ${listeningEntry.artist}`)}`,
            isDirect: !!musicLinks?.spotifyUrl,
            iconImage: "/badges/spotify-icon.svg",
          },
        ];

        return (
          <>
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 110 }}
              onClick={() => setShowListenSheet(false)}
            />
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(180deg, #c8c1e2 0%, #c2bade 100%)",
              borderRadius: "20px 20px 0 0",
              padding: "12px 20px 40px",
              zIndex: 111,
              border: "1px solid rgba(93,79,140,0.2)",
              boxShadow: "0 -10px 40px rgba(46,37,71,0.3)",
            }}>
              {/* 우상단 X 버튼 — 명시적 닫기 (backdrop 클릭도 동일 동작) */}
              <button
                onClick={() => setShowListenSheet(false)}
                aria-label="닫기"
                style={{
                  position: "absolute", top: 12, right: 12,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(46,37,71,0.08)", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(46,37,71,0.55)", cursor: "pointer",
                }}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
              <div style={{ width: 36, height: 4, background: "rgba(46,37,71,0.2)", borderRadius: 2, margin: "0 auto 20px" }} />

              <p className="font-medium text-center" style={{ fontSize: 16, color: "#2e2547", marginBottom: 10 }}>어디서 들을까요?</p>

              <div className="flex justify-center mb-5">
                <span style={{
                  background: "rgba(93,79,140,0.15)",
                  border: "1px solid rgba(93,79,140,0.35)",
                  color: "#5D4F8C", fontSize: 12,
                  padding: "4px 14px", borderRadius: 20,
                }}>
                  {listeningEntry.song}{listeningEntry.artist ? ` — ${listeningEntry.artist}` : ""}
                </span>
              </div>

              {loadingLinks && (
                <div style={{ textAlign: "center", color: "rgba(46,37,71,0.5)", fontSize: 12, marginBottom: 12 }}>
                  🎵 링크 찾는 중...
                </div>
              )}

              <div className="flex flex-col" style={{ gap: 8, marginBottom: 14 }}>
                {platforms.map((p) => (
                  <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      height: 60, background: "rgba(255,255,255,0.55)",
                      border: "1px solid rgba(93,79,140,0.18)",
                      borderRadius: 12, padding: "0 16px",
                      textDecoration: "none",
                      opacity: loadingLinks ? 0.5 : 1,
                    }}
                  >
                    <img src={p.iconImage} alt="" width={40} height={40} style={{ flexShrink: 0, display: "block" }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, color: "#2e2547", display: "block" }}>{p.name}</span>
                      {!loadingLinks && (
                        <span style={{ fontSize: 10, color: p.isDirect ? "#3a8c5a" : "rgba(46,37,71,0.4)" }}>
                          {p.isDirect ? "▶ 바로 재생" : "검색 화면으로 이동"}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 18, color: "rgba(46,37,71,0.35)" }}>›</span>
                  </a>
                ))}
              </div>

            </div>
          </>
        );
      })()}

      {/* 사진 확대 모달 — result/page.tsx 1:1 */}
      {modalIndex !== null && selectedEntry?.photos?.[modalIndex] && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.2s ease",
          }}
          onClick={() => setModalIndex(null)}
        >
          <button
            onClick={() => setModalIndex(null)}
            style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: "50%",
              width: 40, height: 40,
              fontSize: 20, color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 201,
            }}
          >
            ✕
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedEntry.photos[modalIndex]}
            alt={`사진 ${modalIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 8,
              userSelect: "none",
            }}
          />

          {selectedEntry.photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setModalIndex((i) => i !== null ? (i - 1 + selectedEntry.photos.length) % selectedEntry.photos.length : 0); }}
              style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.15)",
                border: "none", borderRadius: "50%",
                width: 44, height: 44,
                fontSize: 22, color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ‹
            </button>
          )}

          {selectedEntry.photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setModalIndex((i) => i !== null ? (i + 1) % selectedEntry.photos.length : 0); }}
              style={{
                position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.15)",
                border: "none", borderRadius: "50%",
                width: 44, height: 44,
                fontSize: 22, color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ›
            </button>
          )}

          {selectedEntry.photos.length > 1 && (
            <div style={{
              position: "absolute", bottom: 24,
              left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.55)",
              borderRadius: 20, padding: "5px 16px",
              fontSize: 13, color: "rgba(255,255,255,0.8)",
            }}>
              {modalIndex + 1} / {selectedEntry.photos.length}
            </div>
          )}

          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </div>
      )}
    </div>
  );
}
