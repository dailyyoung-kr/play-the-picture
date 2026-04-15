"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseWithDeviceId, Entry } from "@/lib/supabase";
import { Archive, Music } from "lucide-react";
import { getDeviceId } from "@/lib/device";

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
  const [showListenSheet, setShowListenSheet] = useState(false);
  const [listeningEntry, setListeningEntry] = useState<Entry | null>(null);
  const [musicLinks, setMusicLinks] = useState<{
    spotifyUrl: string | null;
    youtubeUrl: string | null;
    spotifyFallback: string;
    youtubeFallback: string;
  } | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [swipedEntryId, setSwipedEntryId] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  };

  const handleListenClick = (entry: Entry) => {
    setListeningEntry(entry);
    setMusicLinks(null);
    setShowListenSheet(true);
    setLoadingLinks(true);
    fetch(`/api/music-search?${new URLSearchParams({ song: entry.song, artist: entry.artist })}`)
      .then((r) => r.json())
      .then((data) => setMusicLinks(data))
      .catch(() => setMusicLinks(null))
      .finally(() => setLoadingLinks(false));
  };

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleSwipeEnd = (e: React.TouchEvent, entryId: string) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 60) setSwipedEntryId(entryId);
    else if (diff < -20) setSwipedEntryId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await getSupabaseWithDeviceId().from("entries").delete().eq("id", deleteTarget.id);
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
    const deviceId = getDeviceId();
    getSupabaseWithDeviceId()
      .from("entries")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .not("device_id", "is", null)
      .eq("device_id", deviceId)
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
      <div className="text-center pt-12 pb-1" style={{ fontSize: 15, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300 }}>
        Play the Picture
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
              {/* 기록 표시: 핑크 점 */}
              <div style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {hasEntry ? (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C4687A" }} />
                ) : null}
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
                {selectedEntries.map((entry) => {
                  const isSwiped = swipedEntryId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}
                    >
                      {/* 삭제 버튼 — 스와이프 시에만 렌더 */}
                      {isSwiped && (
                        <button
                          onClick={() => { setSwipedEntryId(null); setDeleteTarget(entry); }}
                          style={{
                            position: "absolute", right: 0, top: 0, bottom: 0, width: 80,
                            background: "rgba(220,60,60,0.90)",
                            border: "none", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, color: "#fff", fontWeight: 600,
                            borderRadius: "0 14px 14px 0",
                          }}
                        >
                          삭제
                        </button>
                      )}

                      {/* 메인 카드 */}
                      <div
                        className="flex items-center gap-3"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 14,
                          padding: "12px 14px",
                          transform: isSwiped ? "translateX(-80px)" : "translateX(0)",
                          transition: "transform 0.2s ease",
                          cursor: "pointer",
                          position: "relative",
                          zIndex: 1,
                          userSelect: "none",
                          WebkitUserSelect: "none",
                        }}
                        onTouchStart={handleSwipeStart}
                        onTouchEnd={(e) => handleSwipeEnd(e, entry.id)}
                        onClick={() => { if (!isSwiped) setSelectedEntry(entry); else setSwipedEntryId(null); }}
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

                        {/* 캐릭터 타입 + 곡명 + 아티스트 */}
                        <div className="flex-1 min-w-0" style={{ textAlign: "left" }}>
                          {entry.vibe_type && (
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.vibe_type}
                            </p>
                          )}
                          <p className="font-semibold" style={{ fontSize: 14, color: "#fff", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.song}
                          </p>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.artist}
                          </p>
                        </div>

                        {/* 시간 + 재생 */}
                        <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                            {formatTime(entry.created_at)}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleListenClick(entry); }}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              fontSize: 13, color: "rgba(255,255,255,0.40)",
                              padding: "2px 4px", lineHeight: 1,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.40)")}
                          >
                            ▶
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
      <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px", flexShrink: 0 }}>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#fff", cursor: "pointer" }} onClick={() => router.push("/journal")}>
          <Archive size={22} strokeWidth={1.5} />
          아카이브
        </div>
        <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", cursor: "pointer" }} onClick={() => router.push("/")}>
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
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px", marginBottom: 16 }}>
              <p style={{ fontSize: 10, color: "#f0d080", marginBottom: 8 }}>왜 이 노래?</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{selectedEntry.reason}</p>
            </div>

            {/* 다시 듣기 버튼 */}
            <button
              onClick={() => handleListenClick(selectedEntry)}
              style={{
                width: "100%", background: "#fff", border: "none",
                borderRadius: 24, padding: 14,
                color: "#0d1218", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ▶  다시 듣기
            </button>
          </div>
        </div>
      )}

      {/* 듣기 바텀시트 */}
      {showListenSheet && listeningEntry && (() => {
        const platforms = [
          {
            name: "YouTube Music에서 듣기",
            url: musicLinks?.youtubeUrl ?? musicLinks?.youtubeFallback ?? `https://music.youtube.com/search?q=${encodeURIComponent(`${listeningEntry.song} ${listeningEntry.artist}`)}`,
            isDirect: !!musicLinks?.youtubeUrl,
            iconBg: "#FF0000",
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="9,6 20,12 9,18" /></svg>,
          },
          {
            name: "Spotify에서 듣기",
            url: musicLinks?.spotifyUrl ?? musicLinks?.spotifyFallback ?? `https://open.spotify.com/search/${encodeURIComponent(`${listeningEntry.song} ${listeningEntry.artist}`)}`,
            isDirect: !!musicLinks?.spotifyUrl,
            iconBg: "#1DB954",
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.713 1.115a.623.623 0 01.206.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.973c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.532-1.072 9.404-.865 13.115 1.338a.937.937 0 01-.955 1.613z"/></svg>,
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
              background: "rgba(13,18,24,0.98)",
              borderRadius: "20px 20px 0 0",
              padding: "12px 20px 40px",
              zIndex: 111,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, margin: "0 auto 20px" }} />

              <p className="font-medium text-center" style={{ fontSize: 16, color: "#fff", marginBottom: 10 }}>어디서 들을까요?</p>

              <div className="flex justify-center mb-5">
                <span style={{
                  background: "rgba(196,104,122,0.18)",
                  border: "1px solid rgba(196,104,122,0.4)",
                  color: "#C4687A", fontSize: 12,
                  padding: "4px 14px", borderRadius: 20,
                }}>
                  {listeningEntry.song}{listeningEntry.artist ? ` — ${listeningEntry.artist}` : ""}
                </span>
              </div>

              {loadingLinks && (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 12 }}>
                  🎵 링크 찾는 중...
                </div>
              )}

              <div className="flex flex-col" style={{ gap: 8, marginBottom: 14 }}>
                {platforms.map((p) => (
                  <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      height: 60, background: "rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "0 16px",
                      textDecoration: "none",
                      opacity: loadingLinks ? 0.5 : 1,
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {p.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, color: "#fff", display: "block" }}>{p.name}</span>
                      {!loadingLinks && (
                        <span style={{ fontSize: 10, color: p.isDirect ? "rgba(100,200,100,0.7)" : "rgba(255,255,255,0.3)" }}>
                          {p.isDirect ? "▶ 바로 재생" : "검색 화면으로 이동"}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)" }}>›</span>
                  </a>
                ))}
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🎵</span>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
                  앱이 설치·로그인되어 있으면<br />추천 곡이 바로 재생돼요
                </p>
              </div>

              <button
                onClick={() => setShowListenSheet(false)}
                style={{
                  width: "100%", cursor: "pointer",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 24, padding: "12px 0",
                  fontSize: 14, color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                }}
              >
                닫기
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
