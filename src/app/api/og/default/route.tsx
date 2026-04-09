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
          paddingBottom: 52,
        }}
      >
        {/* 1. 상단: Play the Picture 로고 */}
        <div
          style={{
            fontSize: 20,
            color: "#C4687A",
            letterSpacing: "0.15em",
            marginTop: 50,
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
            gap: 16,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 220,
                height: 280,
                borderRadius: 12,
                border: "2px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                color: "rgba(255,255,255,0.2)",
              }}
            >
              +
            </div>
          ))}
        </div>

        {/* 3. 하단: 곡명 + 아티스트 + 태그 */}
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
              fontSize: 22,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Play the Picture
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#C4687A",
              marginTop: 4,
            }}
          >
            #감성 #오늘 #플더픽
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
