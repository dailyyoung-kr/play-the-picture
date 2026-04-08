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

export default function JournalPage() {
  const router = useRouter();
  const [today] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  // 해당 월 entries 불러오기
  useEffect(() => {
    const from = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const to = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    supabase
      .from("entries")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .then(({ data }) => setEntries(data ?? []));
  }, [currentYear, currentMonth]);

  // 날짜별 entry 맵
  const entryByDate: Record<string, Entry> = {};
  entries.forEach((e) => { entryByDate[e.date] = e; });

  // 캘린더 계산
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0=일
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

  const monthLabel = `${currentYear}년 ${currentMonth + 1}월`;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)" }}
    >
      {/* 상단 */}
      <div className="text-center pt-12 pb-2" style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)" }}>
        PLAY THE PICTURE
      </div>

      <div className="flex-1 flex flex-col px-5">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between py-5">
          <button onClick={prevMonth} style={{ fontSize: 20, color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer" }}>←</button>
          <span className="font-semibold" style={{ fontSize: 17, color: "#fff" }}>{monthLabel}</span>
          <button onClick={nextMonth} style={{ fontSize: 20, color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer" }}>→</button>
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 8 }}>
          {DAYS.map((d, i) => (
            <div key={d} className="text-center" style={{ fontSize: 11, color: i === 0 ? "rgba(255,100,100,0.7)" : "rgba(255,255,255,0.35)", padding: "4px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {calendarCells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const entry = entryByDate[dateStr];
            const isToday = dateStr === today.toISOString().slice(0, 10);
            const isSunday = (i % 7) === 0;

            return (
              <button
                key={dateStr}
                onClick={() => entry && setSelectedEntry(entry)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: entry ? "rgba(196,104,122,0.15)" : isToday ? "rgba(255,255,255,0.08)" : "transparent",
                  border: isToday ? "1px solid rgba(255,255,255,0.25)" : entry ? "1px solid rgba(196,104,122,0.4)" : "none",
                  cursor: entry ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 13, color: isSunday ? "rgba(255,120,120,0.8)" : entry ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: entry ? 600 : 400 }}>
                  {day}
                </span>
                {entry && <span style={{ fontSize: 10 }}>♪</span>}
              </button>
            );
          })}
        </div>

        {/* 기록 없을 때 안내 */}
        {entries.length === 0 && (
          <p className="text-center mt-10" style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>
            이번 달 기록이 없어요.<br />사진을 올려 첫 기록을 남겨봐요 ✦
          </p>
        )}
      </div>

      {/* 하단 네비게이션 */}
      <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", padding: "10px 0 24px" }}>
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

      {/* 날짜 클릭 시 결과 모달 */}
      {selectedEntry && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, overflowY: "auto" }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              margin: "40px 16px",
              background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
              borderRadius: 20,
              padding: "24px 16px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* 닫기 */}
            <div className="flex justify-between items-center mb-5">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{selectedEntry.date}</span>
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
              <h2 className="font-semibold mb-1" style={{ fontSize: 24, color: "#fff", letterSpacing: "-0.5px" }}>{selectedEntry.song}</h2>
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
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 14px", marginBottom: 12 }}>
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
                  <p style={{ fontSize: 14, color: "#a0f0b0", marginBottom: 4 }}>{selectedEntry.vibe_type}</p>
                  {selectedEntry.vibe_description && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>{selectedEntry.vibe_description}</p>
                  )}
                </div>
              )}
            </div>

            {/* 왜 이 노래 */}
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 14px" }}>
              <p style={{ fontSize: 10, color: "#f0d080", marginBottom: 8 }}>왜 이 노래?</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{selectedEntry.reason}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
