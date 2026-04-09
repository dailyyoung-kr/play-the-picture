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
          gap: 0,
        }}
      >
        {/* Play the Picture */}
        <div
          style={{
            fontSize: 28,
            color: "#C4687A",
            letterSpacing: "0.15em",
            marginBottom: 32,
            fontWeight: 300,
          }}
        >
          Play the Picture
        </div>

        {/* ✦ 심볼 */}
        <div
          style={{
            fontSize: 80,
            color: "#C4687A",
            lineHeight: 1,
            marginBottom: 32,
          }}
        >
          ✦
        </div>

        {/* 플더픽 */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 20,
          }}
        >
          플더픽
        </div>

        {/* 부제 */}
        <div
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          사진으로 지금 딱 맞는 노래 찾기
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
