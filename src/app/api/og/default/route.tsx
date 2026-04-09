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
            fontSize: 24,
            color: "#C4687A",
            letterSpacing: "0.2em",
            marginBottom: 40,
            fontWeight: 300,
          }}
        >
          Play the Picture
        </div>

        {/* 플더픽 */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 36,
            letterSpacing: "-0.02em",
          }}
        >
          플더픽
        </div>

        {/* 부제 */}
        <div
          style={{
            fontSize: 26,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.02em",
          }}
        >
          사진으로 지금 딱 맞는 노래 찾기
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
