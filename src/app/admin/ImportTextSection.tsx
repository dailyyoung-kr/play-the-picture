"use client";

import { memo, useState } from "react";

const IMPORT_GENRES = [
  { value: "kpop", label: "K-POP" },
  { value: "pop", label: "팝" },
  { value: "hiphop", label: "힙합" },
  { value: "indie", label: "인디" },
  { value: "rnb", label: "R&B/소울" },
  { value: "acoustic_jazz", label: "어쿠스틱/재즈" },
];

type TextResult = {
  success: number;
  failed: string[];
  duplicates?: { song: string; artist: string; existingGenre: string }[];
  added_songs?: { song: string; artist: string }[];
  total: number;
  genreBreakdown?: Record<string, number>;
};

type Props = {
  showToast: (msg: string) => void;
};

/**
 * 텍스트로 곡 추가 섹션 — admin/page.tsx에서 분리
 *
 * 분리 이유:
 *   page.tsx가 1,700줄짜리 단일 컴포넌트라 textarea onChange마다 전체 리렌더 → 타이핑 지연.
 *   곡 추가 관련 state 7개 + handleTextImport를 자식 컴포넌트 내부로 이전하고 React.memo로 격리.
 *   부모 page.tsx의 차트·표 리렌더가 textarea에 영향 X.
 */
function ImportTextSectionInner({ showToast }: Props) {
  const [textSongs, setTextSongs] = useState("");
  const [textGenre, setTextGenre] = useState("auto");
  const [textLoading, setTextLoading] = useState(false);
  const [textProgress, setTextProgress] = useState<{ current: number; total: number } | null>(null);
  const [textResult, setTextResult] = useState<TextResult | null>(null);
  const [textCooldown, setTextCooldown] = useState(0); // 남은 쿨다운 초
  const [textWaiting, setTextWaiting] = useState(false); // 30초 대기 중 표시

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
        credentials: "same-origin",
        body: JSON.stringify({ songs: textSongs, genre: textGenre }),
      });
      const data = await res.json();
      simActive = false;
      setTextProgress(null);
      setTextWaiting(false);

      if (!res.ok) { showToast(data.error ?? "추가 실패"); return; }
      setTextResult(data);
      showToast(`${data.success}곡 저장 완료!`);

      // 백그라운드 미리듣기 매칭 트리거 — 곡 추가와 동시에 cache 채움
      // /api/itunes-preview는 캐시 + iTunes Search 자동 처리
      if (data.added_songs && data.added_songs.length > 0) {
        for (const s of data.added_songs as { song: string; artist: string }[]) {
          fetch(`/api/itunes-preview?title=${encodeURIComponent(s.song)}&artist=${encodeURIComponent(s.artist)}`)
            .catch(() => {});  // fire-and-forget
        }
      }
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

  return (
    <>
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
    </>
  );
}

export const ImportTextSection = memo(ImportTextSectionInner);
