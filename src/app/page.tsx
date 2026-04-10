"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Music } from "lucide-react";
import { supabase, getDeviceId } from "@/lib/supabase";

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
  const [photos, setPhotos] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const maxPhotos = 5;

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
    supabase.from("photo_upload_logs").insert({ device_id: getDeviceId(), photo_count: photos.length });
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
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* 상단 앱 이름 */}
      <div
        className="text-center pt-12 pb-7"
        style={{ fontSize: 15, letterSpacing: "0.2em", color: "#C4687A", fontFamily: "var(--font-dm-sans)", fontWeight: 300 }}
      >
        Play the Picture
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col px-5">
        {/* 헤드라인 */}
        <h1
          className="font-semibold mb-3"
          style={{ fontSize: 26, color: "#fff", lineHeight: 1.35, letterSpacing: "-0.5px" }}
        >
          매번 노래 고르기<br />귀찮지 않아요?
        </h1>

        {/* 부제목 */}
        <p
          className="mb-7"
          style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 2.2 }}
        >
          지금 생각나는 사진 몇 장이면<br />
          AI가 오늘의 딱 맞는 한 곡을 찾아드려요
        </p>

        {/* 섹션 타이틀 + 카운트 배지 */}
        <div className="flex justify-between items-center mb-3">
          <div style={{ position: "relative", paddingBottom: 5 }}>
            <span className="font-semibold" style={{ fontSize: 16, color: "#fff" }}>
              사진 추가
            </span>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 32,
                height: 2,
                background: "#C4687A",
                borderRadius: 2,
              }}
            />
          </div>
          <span
            className="font-medium"
            style={{
              background: "#C4687A",
              color: "#fff",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 20,
            }}
          >
            {photos.length} / {maxPhotos}
          </span>
        </div>

        {/* 사진 슬롯 — 가로 스크롤 */}
        <div style={{ position: "relative", marginBottom: 8 }}>
        <div className="no-scrollbar" style={{ display: "flex", flexDirection: "row", gap: 8, overflowX: "auto", paddingRight: photos.length >= 3 ? 40 : 0 }}>
          {photos.map((src, i) => (
            <div
              key={i}
              style={{
                width: 100, height: 124, borderRadius: 10,
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
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 100, height: 124, borderRadius: 10, flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
              }}
            >
              +
            </button>
          )}
        </div>
          {/* 오른쪽 페이드 그라데이션 — 3장 이상일 때만 */}
          {photos.length >= 3 && (
            <div style={{
              position: "absolute", top: 0, right: 0,
              width: 60, height: "100%",
              background: "linear-gradient(to right, transparent 0%, #0d1218 100%)",
              pointerEvents: "none",
            }} />
          )}
        </div>

        {/* 안내 문구 */}
        <p className="text-right" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
          최대 5장까지 추가할 수 있어요
        </p>
        <p className="text-right mb-6" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
          사진은 AI 분석에 사용되며, 저장 시에만 공유 링크에 포함돼요
        </p>

        <div className="flex-1" />

        {/* 사진 추가 버튼 */}
        <button
          className="w-full mb-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= maxPhotos}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 24,
            padding: "10px 0",
            color: photos.length >= maxPhotos ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)",
            fontSize: 14,
            cursor: photos.length >= maxPhotos ? "default" : "pointer",
          }}
        >
          사진 추가하기
        </button>

        {/* 다음 버튼 */}
        <button
          className="w-full font-medium mb-2"
          onClick={handleNext}
          disabled={photos.length === 0}
          style={{
            background: photos.length === 0 ? "rgba(196,104,122,0.4)" : "#C4687A",
            border: "none",
            borderRadius: 24,
            padding: 14,
            color: "#fff",
            fontSize: 14,
            cursor: photos.length === 0 ? "default" : "pointer",
          }}
        >
          다음 →
        </button>

        {/* 스텝 점 3개 */}
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
      </div>

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

      {/* 하단 네비게이션 */}
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
    </div>
  );
}
