"use client";

import { useEffect, useState } from "react";

type LogEntry = { ts: string; msg: string };

export default function IgStoriesTestPage() {
  const [ua, setUa] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [imgUrl, setImgUrl] = useState<string>("");

  useEffect(() => {
    setUa(navigator.userAgent);
    drawTestImage();
  }, []);

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    setLogs((prev) => [{ ts, msg }, ...prev].slice(0, 30));
  };

  const env = (() => {
    if (!ua) return "loading";
    if (/Instagram/.test(ua)) return "🟣 insta_inapp ⭐";
    if (/KAKAOTALK/.test(ua)) return "💛 kakao_inapp";
    if (/FBAN|FBAV/.test(ua)) return "🔵 fb_inapp";
    if (/; wv\)/.test(ua)) return "🤖 android_webview";
    if (/CriOS/.test(ua)) return "🦊 ios_chrome";
    if (/iPhone|iPad/.test(ua)) return "🍎 ios_safari";
    if (/Android/.test(ua)) return "🤖 android_chrome";
    if (/Macintosh/.test(ua)) return "💻 mac_desktop";
    if (/Windows/.test(ua)) return "💻 win_desktop";
    return "❓ other";
  })();

  // 9:16 테스트 이미지 생성 (1080x1920)
  const drawTestImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;
    // 배경 그라데이션
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, "#0d1a10");
    grad.addColorStop(0.5, "#0d1218");
    grad.addColorStop(1, "#1a0d18");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);
    // 텍스트
    ctx.fillStyle = "#C4687A";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Play the Picture", 540, 800);
    ctx.fillStyle = "#fff";
    ctx.font = "60px sans-serif";
    ctx.fillText("✦ 인스타 스토리 테스트", 540, 950);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "36px sans-serif";
    ctx.fillText(new Date().toLocaleString("ko-KR"), 540, 1050);
    setImgUrl(canvas.toDataURL("image/png"));
    log("✓ 9:16 테스트 이미지 생성 (1080x1920)");
  };

  // ─── 검증 1: instagram://story-camera ───
  const tryStoryCamera = () => {
    log("→ instagram://story-camera 호출");
    const start = Date.now();
    window.location.href = "instagram://story-camera";
    setTimeout(() => {
      const elapsed = Date.now() - start;
      if (document.hidden || document.visibilityState === "hidden") {
        log(`✓ 페이지 hidden — 인스타 앱 진입 가능성 (${elapsed}ms)`);
      } else {
        log(`✗ 페이지 visible — 차단 또는 앱 미설치 (${elapsed}ms)`);
      }
    }, 1500);
  };

  // ─── 검증 2: instagram-stories://share?source_application=... ───
  const tryStoriesShare = () => {
    log("→ instagram-stories://share?source_application=test 호출");
    const start = Date.now();
    window.location.href = "instagram-stories://share?source_application=test";
    setTimeout(() => {
      const elapsed = Date.now() - start;
      if (document.hidden || document.visibilityState === "hidden") {
        log(`✓ 페이지 hidden — 인스타 앱 진입 가능성 (${elapsed}ms)`);
      } else {
        log(`✗ 페이지 visible — App ID 없거나 차단 (${elapsed}ms)`);
      }
    }, 1500);
  };

  // ─── 검증 3: instagram:// 단순 앱 열기 ───
  const tryOpenApp = () => {
    log("→ instagram:// 호출");
    const start = Date.now();
    window.location.href = "instagram://";
    setTimeout(() => {
      const elapsed = Date.now() - start;
      if (document.hidden || document.visibilityState === "hidden") {
        log(`✓ 페이지 hidden — 인스타 앱 진입 (${elapsed}ms)`);
      } else {
        log(`✗ 페이지 visible — 차단 또는 앱 미설치 (${elapsed}ms)`);
      }
    }, 1500);
  };

  // ─── 검증 4: 이미지 blob 다운로드 (fallback 메인) ───
  const tryDownload = () => {
    if (!imgUrl) {
      log("✗ 이미지 없음");
      return;
    }
    log("→ 9:16 이미지 다운로드 시도");
    try {
      // dataURL → Blob
      const arr = imgUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/png";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8 = new Uint8Array(n);
      while (n--) u8[n] = bstr.charCodeAt(n);
      const blob = new Blob([u8], { type: mime });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ptp-story-test-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      log("✓ 다운로드 트리거 완료 (갤러리 저장 여부 확인 필요)");
    } catch (e) {
      log(`✗ 다운로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ─── 검증 6: navigator.share({ files }) — Web Share Level 2 (갤러리 저장 가능성) ───
  const tryShareFile = async () => {
    if (!imgUrl) {
      log("✗ 이미지 없음");
      return;
    }
    log("→ navigator.share({ files }) 시도");
    try {
      // navigator 자체 지원 여부
      if (typeof navigator === "undefined" || !navigator.share) {
        log("✗ navigator.share 미지원");
        return;
      }
      // dataURL → File
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], "ptp-story-test.png", { type: "image/png" });

      // canShare files 지원 여부
      if (typeof navigator.canShare === "function") {
        const ok = navigator.canShare({ files: [file] });
        log(`canShare({files}) = ${ok}`);
        if (!ok) {
          log("✗ files share 차단됨 (인앱 또는 정책)");
          return;
        }
      } else {
        log("⚠ canShare 미지원 — share 강행");
      }

      await navigator.share({ files: [file] });
      log("✓ share 성공 (사용자가 사진 저장 선택했는지 확인)");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (name === "AbortError" || msg.includes("abort")) {
        log("⚠ 사용자 취소 (AbortError)");
      } else {
        log(`✗ ${name}: ${msg}`);
      }
    }
  };

  // ─── 검증 5: 새 탭으로 이미지 표시 (모바일 long-press 저장) ───
  const tryNewTab = () => {
    if (!imgUrl) return;
    log("→ 새 탭에 이미지 표시 (long-press 저장 확인용)");
    const w = window.open();
    if (w) {
      w.document.write(
        `<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${imgUrl}" style="max-width:100%;max-height:100vh" /></body></html>`
      );
      log("✓ 새 탭 열림");
    } else {
      log("✗ 새 탭 차단됨 (popup blocker 또는 인앱)");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1218",
        color: "#fff",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 12, color: "#C4687A" }}>
        ✦ IG Stories Deeplink 검증
      </h1>

      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          padding: 12,
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div>
          <strong>환경:</strong> {env}
        </div>
        <div style={{ wordBreak: "break-all", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {ua}
        </div>
      </div>

      {/* 9:16 미리보기 */}
      {imgUrl && (
        <div style={{ marginBottom: 16, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt="9:16 test"
            style={{ width: 120, height: 213, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)" }}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            9:16 (1080×1920) 테스트 이미지
          </div>
        </div>
      )}

      {/* 검증 버튼들 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <button onClick={tryStoryCamera} style={btnStyle("#C4687A")}>
          1️⃣ instagram://story-camera
        </button>
        <button onClick={tryStoriesShare} style={btnStyle("#C4687A")}>
          2️⃣ instagram-stories://share (App ID 없이)
        </button>
        <button onClick={tryOpenApp} style={btnStyle("rgba(255,255,255,0.15)")}>
          3️⃣ instagram:// (단순 앱 열기)
        </button>
        <button onClick={tryDownload} style={btnStyle("rgba(255,255,255,0.15)")}>
          4️⃣ 이미지 다운로드 (a.click)
        </button>
        <button onClick={tryNewTab} style={btnStyle("rgba(255,255,255,0.15)")}>
          5️⃣ 새 탭에 이미지 (long-press 저장용)
        </button>
        <button onClick={tryShareFile} style={btnStyle("#7d3a4d")}>
          6️⃣ navigator.share files (Web Share L2) ⭐
        </button>
        <button onClick={() => setLogs([])} style={btnStyle("rgba(255,255,255,0.08)")}>
          로그 초기화
        </button>
      </div>

      {/* 로그 */}
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          padding: 12,
          borderRadius: 10,
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          minHeight: 200,
          maxHeight: 400,
          overflowY: "auto",
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)" }}>버튼을 눌러 검증 시작...</div>
        ) : (
          logs.map((l, i) => (
            <div key={i} style={{ color: l.msg.startsWith("✓") ? "#7ed987" : l.msg.startsWith("✗") ? "#e88" : "rgba(255,255,255,0.7)" }}>
              [{l.ts}] {l.msg}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.6,
        }}
      >
        💡 <strong>검증 방법:</strong>
        <br />• 본인 인스타 DM에 본 페이지 URL을 보낸 뒤 인스타 앱에서 클릭 → 인앱 브라우저로 진입
        <br />• 각 버튼 누르고 인스타 앱이 열리는지 / 페이지 그대로인지 확인
        <br />• page hidden 감지로 deeplink 작동 여부 추정 (정확하진 않음 — 직접 화면 관찰 권장)
      </div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "12px 16px",
    background: bg,
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
  };
}
