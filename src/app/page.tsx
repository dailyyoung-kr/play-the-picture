"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";
import { supabase, getDeviceId } from "@/lib/supabase";
import { pixelInitiateCheckout } from "@/lib/fpixel";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { captureUtmFromUrl } from "@/lib/utm";

// 사진을 800px 이하로 압축해서 base64로 변환
function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > height && width > MAX) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else if (height > MAX) {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ptp_photos") ?? "[]"); } catch { return []; }
  });
  const [toast, setToast] = useState("");
  const maxPhotos = 5;

  // URL에 utm_* 있으면 sessionStorage에 저장 (이후 analyze_logs에 기록됨)
  useEffect(() => { captureUtmFromUrl(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.some((f) => f.type.startsWith("video/"))) {
      showToast("사진 파일만 추가할 수 있어요 📷");
      e.target.value = "";
      return;
    }
    if (photos.length >= maxPhotos) {
      showToast("사진은 최대 5장까지 추가할 수 있어요");
      e.target.value = "";
      return;
    }
    const remaining = maxPhotos - photos.length;
    const toProcess = files.slice(0, remaining);
    const compressed = await Promise.all(toProcess.map(compressImage));
    const newPhotos = [...photos, ...compressed];
    setPhotos(newPhotos);
    localStorage.setItem("ptp_photos", JSON.stringify(newPhotos));
    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    localStorage.setItem("ptp_photos", JSON.stringify(newPhotos));
  };

  const handleNext = () => {
    if (photos.length === 0) return;
    if (isAnalyticsEnabled()) {
      supabase
        .from("photo_upload_logs")
        .insert({ device_id: getDeviceId(), photo_count: photos.length })
        .then(({ error }) => { if (error) console.error("[photo_log]", error.message); });
    }
    pixelInitiateCheckout();
    router.push("/preference");
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(158deg, #0d1a10 0%, #0d1218 50%, #1a1408 100%)",
      }}
    >
      {/* 숨겨진 파일 입력 */}
      <input
        id="photo-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
        onChange={handleFileSelect}
      />

      {/* 메인 콘텐츠 — 세로 중앙 정렬 */}
      <div className="flex-1 flex flex-col" style={{ paddingTop: "18vh" }}>

      {/* 상단 앱 이름 */}
      <div
        className="text-center pb-7"
        style={{ fontSize: 15, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300 }}
      >
        Play the Picture
      </div>

      {/* 본문 */}
      <div className="flex flex-col px-5">
        {/* 헤드라인 + 부제목 — 사진 0장일 때만 */}
        {photos.length === 0 && (
          <>
            <h1
              className="font-semibold mb-3"
              style={{ fontSize: 26, color: "#fff", lineHeight: 1.35, letterSpacing: "-0.5px" }}
            >
              오늘 찍은 사진에<br />어떤 노래가 어울릴까?
            </h1>
            <p
              className="mb-7"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 1.7 }}
            >
              AI가 사진 분위기를 읽고, 딱 맞는 한 곡을 골라줘요
            </p>
          </>
        )}

        {/* 섹션 타이틀 + 카운트 배지 — 사진 1장 이상일 때만 */}
        {photos.length > 0 && (
          <div className="mb-3">
            <span className="font-semibold" style={{ fontSize: 16, color: "#fff" }}>
              사진 추가{" "}
              <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 400 }}>
                · 최대 {maxPhotos}장
              </span>
            </span>
          </div>
        )}

        {photos.length === 0 ? (
          /* 사진 0장: 단일 CTA 큰 + 슬롯 */
          <>
            <label
              htmlFor="photo-input"
              style={{
                width: "100%",
                height: 220,
                borderRadius: 16,
                border: "1.5px dashed rgba(196,104,122,0.6)",
                background: "rgba(196,104,122,0.08)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                cursor: "pointer",
                transition: "all 0.25s ease",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "#C4687A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, color: "#fff", fontWeight: 300, lineHeight: 1,
                }}
              >
                +
              </div>
              <span style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>
                사진 추가하기
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                최대 5장까지 추가할 수 있어요
              </span>
            </label>
            <p className="text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginBottom: 20 }}>
              사진은 노래 추천에만 사용돼요
            </p>
          </>
        ) : (
          <>
            {/* 사진 슬롯 — 가로 스크롤 */}
            <div style={{ position: "relative", marginBottom: 8 }}>
              <div className="no-scrollbar" style={{ display: "flex", flexDirection: "row", gap: 8, overflowX: "auto", paddingRight: photos.length >= 3 ? 60 : 0 }}>
                {photos.map((src, i) => (
                  <div
                    key={i}
                    style={{
                      width: 120, height: 148, borderRadius: 10,
                      overflow: "hidden", position: "relative", flexShrink: 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`사진 ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <button
                      onClick={() => removePhoto(i)}
                      style={{
                        position: "absolute", top: 5, right: 5,
                        width: 18, height: 18,
                        background: "rgba(0,0,0,0.6)", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: "#fff", cursor: "pointer", border: "none",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* + 슬롯 (5장 미만일 때만) */}
                {photos.length < maxPhotos && (
                  <label
                    htmlFor="photo-input"
                    style={{
                      width: 120, height: 148, borderRadius: 10, flexShrink: 0,
                      border: "1.5px dashed rgba(196,104,122,0.35)",
                      background: "rgba(196,104,122,0.04)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, color: "rgba(196,104,122,0.55)",
                      cursor: "pointer",
                    }}
                  >
                    +
                  </label>
                )}
              </div>
              {/* 오른쪽 페이드 그라데이션 — 3장 이상일 때만 */}
              {photos.length >= 3 && (
                <div style={{
                  position: "absolute", top: 0, right: 0,
                  width: 30, height: "100%",
                  background: "linear-gradient(to right, transparent 0%, #0d1218 100%)",
                  pointerEvents: "none",
                }} />
              )}
            </div>

            {/* 안내 문구 — 프라이버시 안심만 유지 */}
            <p className="text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 12, marginBottom: 20 }}>
              사진은 노래 추천에만 사용돼요
            </p>

            {/* 분석 버튼 */}
            <button
              className="w-full font-medium mb-2"
              onClick={handleNext}
              style={{
                background: "#C4687A",
                border: "none",
                borderRadius: 24,
                padding: 14,
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              노래 찾으러 가기
            </button>
          </>
        )}

        {/* 스텝 점 3개 — 사진 1장 이상일 때만 */}
        {photos.length > 0 && (
          <div className="flex gap-2 justify-center py-3">
            {[true, false, false].map((active, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: active ? "#fff" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>
        )}
      </div>
      </div>{/* 메인 콘텐츠 wrapper 끝 */}

      {/* 토스트 메시지 */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(30,30,30,0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: 13,
          padding: "10px 20px",
          borderRadius: 24,
          zIndex: 100,
          whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}

      {/* 하단 네비게이션 — 사진 1장 이상일 때만 */}
      {photos.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.45)", borderTop: "0.5px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around", padding: "12px 0 28px" }}>
          <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", cursor: "pointer" }} onClick={() => router.push("/journal")}>
            <Archive size={22} strokeWidth={1.5} />
            아카이브
          </div>
          <div className="flex flex-col items-center gap-1" style={{ fontSize: 10, color: "#fff", cursor: "pointer" }} onClick={() => router.push("/")}>
            <Music size={22} strokeWidth={1.5} />
            노래 추천받기
          </div>
        </div>
      )}
    </div>
  );
}
