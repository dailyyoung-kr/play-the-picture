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
          justifyContent: "space-between",
          padding: "50px 80px",
        }}
      >
        {/* 상단 40%: 브랜드 텍스트 영역 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: "#C4687A",
              letterSpacing: "0.15em",
              fontWeight: 300,
            }}
          >
            Play the Picture
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            플더픽
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.45)",
              marginTop: 4,
            }}
          >
            사진을 올리면 AI가 오늘의 딱 맞는 한 곡을 추천해드려요
          </div>
        </div>

        {/* 하단 60%: 사진 플레이스홀더 3장 */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 260,
                height: 200,
                borderRadius: 12,
                border: "1.5px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                color: "rgba(255,255,255,0.3)",
              }}
            >
              +
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
