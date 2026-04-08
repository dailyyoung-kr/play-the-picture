"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Entry } from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const EMOTION_LABELS = [
  { key: "행복함", emoji: "😊", color: "#f0d080" },
  { key: "설레임", emoji: "💗", color: "#f0a0c0" },
  { key: "에너지", emoji: "⚡", color: "#a0d4f0" },
  { key: "특별함", emoji: "✨", color: "#a0f0b0" },
] as const;

function formatTime(isoString: string) {
  const d = new Date(isoString);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}:${m}`;
}

export default function JournalPage() {
  const router = useRouter();
  const [today] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    today.toISOString().slice(0, 10)
  );
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("entries").delete().eq("id", deleteTarget.id);
    if (!error) {
      setEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
      showToast("기록이 삭제됐어요");
    }
    setDeleteTarget(null);
  };

  useEffect(() => {
    const from = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const to = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    supabase
      .from("entries")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("created_at", { ascending: false })
      .then(({ data }) => setEntries(data ?? []));
  }, [currentYear, currentMonth]);

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
      style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
    >
      {/* 상단 */}
      <div className="text-center pt-12 pb-1" style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)" }}>
        PLAY THE PICTURE
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={prevMonth} style={{ fontSize: 20, color: "rgba(255,255,255,0.55)", background: "none", border: "none", cursor: "pointer" }}>←</button>
        <span className="font-semibold" style={{ fontSize: 17, color: "#fff" }}>
          {currentYear}년 {currentMonth + 1}월
        </span>
        <button onClick={nextMonth} style={{ fontSize: 20, color: "rgba(255,255,255,0.55)", background: "none", border: "none", cursor: "pointer" }}>→</button>
      </div>

      {/* 요일 헤더 */}
      <div className="px-4" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {DAYS.map((d, i) => (
          <div key={d} className="text-center" style={{
            fontSize: 11,
            color: i === 0 ? "rgba(255,100,100,0.65)" : i === 6 ? "rgba(100,160,255,0.65)" : "rgba(255,255,255,0.30)",
            padding: "3px 0",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="px-4 mb-4" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {calendarCells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEntry = !!entriesByDate[dateStr]?.length;
          const isToday = dateStr === today.toISOString().slice(0, 10);
          const isSelected = dateStr === selectedDate;
          const isSunday = (i % 7) === 0;
          const isSaturday = (i % 7) === 6;

          return (
            <button
              key={dateStr}
              onClick={() => handleDateClick(dateStr)}
              style={{
                padding: "8px 0 6px",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                background: isSelected ? "rgba(196,104,122,0.22)" : isToday ? "rgba(255,255,255,0.07)" : "transparent",
                border: isSelected ? "1px solid rgba(196,104,122,0.6)" : isToday ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: isSelected || hasEntry ? 600 : 400,
                color: isSelected ? "#fff"
                  : isSunday ? "rgba(255,110,110,0.85)"
                  : isSaturday ? "rgba(110,170,255,0.85)"
                  : "rgba(255,255,255,0.75)",
              }}>
                {day}
              </span>
              {/* 기록 있으면 핑크 점 */}
              <div style={{ height: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {hasEntry && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C4687A" }} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 구분선 */}
      <div style={{ height: "0.5px", background: "rgba(255,255,255,0.08)", margin: "0 0 16px" }} />

      {/* 선택된 날짜 기록 목록 */}
      <div className="flex-1 px-5 overflow-y-auto">
        {selectedDate && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold" style={{ fontSize: 14, color: "#fff" }}>
                {selectedDateLabel}
              </span>
              {selectedEntries.length > 0 && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                  기록 {selectedEntries.length}개
                </span>
              )}
            </div>

            {selectedEntries.length === 0 ? (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", textAlign: "center", marginTop: 24 }}>
                이 날의 기록이 없어요
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="w-full flex items-center gap-3"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: "12px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {/* 썸네일 */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}>
                      {entry.photos?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </div>

                    {/* 곡명 + 유형 */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold" style={{ fontSize: 14, color: "#fff", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.song}
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.vibe_type || entry.artist}
                      </p>
                    </div>

                    {/* 시간 + 삭제 */}
                    <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        {formatTime(entry.created_at)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 14, color: "rgba(255,255,255,0.30)",
                          padding: "2px 4px", lineHeight: 1,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,100,100,0.7)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
                      >
                        🗑️
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px" }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1a1a2a", borderRadius: 18, padding: "24px 20px", width: "100%", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <p className="font-semibold text-center" style={{ fontSize: 15, color: "#fff", marginBottom: 8 }}>
              이 기록을 삭제할까요?
            </p>
            <p className="text-center" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
              {deleteTarget.song} · {formatTime(deleteTarget.created_at)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.75)", fontSize: 14, cursor: "pointer" }}
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
      <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", padding: "10px 0 24px", flexShrink: 0 }}>
        {[
          { icon: "📓", label: "JOURNAL", active: true, path: "/journal" },
          { icon: "🖼", label: "GALLERY", active: false, path: "/" },
          { icon: "+", label: "UPLOAD", active: false, isCenter: true, path: "/" },
          { icon: "⚙️", label: "SETTINGS", active: false, path: "/" },
        ].map((item) => (
          <div key={item.label} onClick={() => router.push(item.path)}
            className="flex-1 flex flex-col items-center gap-1"
            style={{ fontSize: 10, color: item.active ? "#fff" : "rgba(255,255,255,0.38)", cursor: "pointer" }}
          >
            {item.isCenter ? (
              <div style={{ width: 38, height: 38, background: "#C4687A", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", marginTop: -8 }}>+</div>
            ) : (
              <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{item.icon}</div>
            )}
            {item.label}
          </div>
        ))}
      </div>

      {/* 상세 모달 */}
      {selectedEntry && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50, overflowY: "auto" }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ margin: "40px 16px 40px", background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)", borderRadius: 20, padding: "20px 16px", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex justify-between items-center mb-4">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {selectedEntry.date} · {formatTime(selectedEntry.created_at)}
              </span>
              <button onClick={() => setSelectedEntry(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {/* 사진 */}
            {selectedEntry.photos?.length > 0 && (
              <div className="flex gap-2 justify-center mb-4">
                {selectedEntry.photos.slice(0, 3).map((src, i) => (
                  <div key={i} style={{ width: 90, height: 112, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.13)", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
              </div>
            )}

            {/* 노래 */}
            <div className="text-center mb-4">
              <h2 className="font-semibold mb-1" style={{ fontSize: 22, color: "#fff", letterSpacing: "-0.5px" }}>{selectedEntry.song}</h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.48)", marginBottom: 10 }}>{selectedEntry.artist}</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {selectedEntry.tags?.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.78)" }}>
                    #{tag.replace(/^#+/, "")}
                  </span>
                ))}
              </div>
            </div>

            {/* 감정 분석 */}
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px", marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginBottom: 12 }}>✦ 감정 분석</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {EMOTION_LABELS.map(({ key, emoji, color }) => {
                  const pct = selectedEntry.emotions?.[key] ?? 0;
                  return (
                    <div key={key} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
                      <div className="flex justify-between items-center mb-2">
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)" }}>{emoji} {key}</span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedEntry.vibe_type && (
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>사진으로 보는 오늘의 선곡</p>
                  <p style={{ fontSize: 14, color: "#a0f0b0", marginBottom: 3 }}>{selectedEntry.vibe_type}</p>
                  {selectedEntry.vibe_description && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>{selectedEntry.vibe_description}</p>
                  )}
                </div>
              )}
            </div>

            {/* 왜 이 노래 */}
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px" }}>
              <p style={{ fontSize: 10, color: "#f0d080", marginBottom: 8 }}>왜 이 노래?</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{selectedEntry.reason}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
