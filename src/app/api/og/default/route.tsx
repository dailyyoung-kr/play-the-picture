import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0d1218",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "40px 0",
        }}
      >
        {/* 1. 상단: Play the Picture 로고 */}
        <div
          style={{
            fontSize: 20,
            color: "#C4687A",
            letterSpacing: "0.15em",
            fontWeight: 300,
          }}
        >
          Play the Picture
        </div>

        {/* 2. 중앙: 사진 플레이스홀더 3장 */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 240,
                height: 300,
                borderRadius: 12,
                border: "2px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              +
            </div>
          ))}
        </div>

        {/* 3. 하단: 곡명 + 설명 문구 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 42,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            오늘의 한 곡
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            사진을 올리면 AI가 오늘의 딱 맞는 한 곡을 추천해드려요
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
