"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const maxPhotos = 5;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
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
        style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.28)" }}
      >
        PLAY THE PICTURE
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
          style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 1.8 }}
        >
          지금 생각나는 사진 몇 장이면<br />
          AI가 오늘 분위기를 읽어<br />
          딱 맞는 노래를 바로 추천해드려요
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

        {/* 사진 슬롯 */}
        <div className="flex gap-2 mb-2" style={{ flexWrap: "wrap" }}>
          {photos.map((src, i) => (
            <div
              key={i}
              style={{ width: 96, height: 116, borderRadius: 10, overflow: "hidden", position: "relative", flexShrink: 0 }}
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
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 18,
                  height: 18,
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: "#fff",
                  cursor: "pointer",
                  border: "none",
                }}
              >
                ✕
              </button>
            </div>
          ))}

          {/* + 추가 슬롯 (최대 미만일 때만 표시) */}
          {photos.length < maxPhotos && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 96,
                height: 116,
                borderRadius: 10,
                border: "1.5px dashed rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                color: "rgba(255,255,255,0.40)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              +
            </button>
          )}
        </div>

        {/* 안내 문구 */}
        <p className="text-right mb-6" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
          최대 5장까지 추가할 수 있어요
        </p>

        <div className="flex-1" />

        {/* 사진 추가 버튼 */}
        <button
          className="w-full flex items-center justify-center gap-2 mb-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= maxPhotos}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 24,
            padding: 14,
            color: photos.length >= maxPhotos ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.75)",
            fontSize: 14,
            cursor: photos.length >= maxPhotos ? "default" : "pointer",
          }}
        >
          <span>📷</span> 사진 추가하기 {photos.length}/{maxPhotos}
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

      {/* 하단 네비게이션 */}
      <div
        style={{
          background: "rgba(0,0,0,0.45)",
          borderTop: "0.5px solid rgba(255,255,255,0.08)",
          display: "flex",
          padding: "10px 0 24px",
        }}
      >
        {[
          { icon: "📓", label: "ARCHIVE", active: false, path: "/journal" },
          { icon: "+", label: "UPLOAD", active: true, isCenter: true, path: "/" },
          { icon: "⚙️", label: "SETTINGS", active: false, path: "/" },
        ].map((item) => (
          <div
            key={item.label}
            onClick={() => item.path && router.push(item.path)}
            className="flex-1 flex flex-col items-center gap-1"
            style={{
              fontSize: 10,
              color: item.active ? "#fff" : "rgba(255,255,255,0.38)",
              cursor: "pointer",
            }}
          >
            {item.isCenter ? (
              <div
                style={{
                  width: 38,
                  height: 38,
                  background: "#C4687A",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#fff",
                  marginTop: -8,
                }}
              >
                +
              </div>
            ) : (
              <div
                style={{
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                }}
              >
                {item.icon}
              </div>
            )}
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
