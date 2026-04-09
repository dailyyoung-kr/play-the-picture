import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response("Missing id", { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data } = await supabase
      .from("entries")
      .select("song, artist, album_art, photos")
      .eq("id", id)
      .single();

    const song = data?.song ?? "오늘의 추천곡";
    const artist = data?.artist ?? "";
    const albumArt: string | null = data?.album_art ?? null;
    const photos: string[] = data?.photos ?? [];

    // 사진 영역: 좌측 전체 높이
    const PHOTO_W = 520;
    const PHOTO_H = 630;
    const count = photos.length;
    const gap = 10;

    type PhotoItem = { src: string; x: number; y: number; w: number; h: number };

    function getPhotoLayout(): PhotoItem[] {
      if (count === 0) return [];

      if (count === 1) {
        return [{ src: photos[0], x: 0, y: 0, w: PHOTO_W, h: PHOTO_H }];
      }

      if (count === 2) {
        const w = (PHOTO_W - gap) / 2;
        return [
          { src: photos[0], x: 0,       y: 0, w, h: PHOTO_H },
          { src: photos[1], x: w + gap,  y: 0, w, h: PHOTO_H },
        ];
      }

      if (count === 3) {
        const colW = (PHOTO_W - gap) / 2;
        const rowH = (PHOTO_H - gap) / 2;
        return [
          { src: photos[0], x: 0,          y: 0,          w: colW,   h: rowH },
          { src: photos[1], x: colW + gap,  y: 0,          w: colW,   h: rowH },
          { src: photos[2], x: 0,           y: rowH + gap, w: PHOTO_W, h: rowH },
        ];
      }

      // 4~5장: 상단 2개 + 하단 나머지
      const rowH = (PHOTO_H - gap) / 2;
      const colW = (PHOTO_W - gap) / 2;
      const rest = photos.slice(2);
      const botCount = rest.length;
      const botW =
        botCount === 1
          ? PHOTO_W
          : botCount === 2
          ? colW
          : (PHOTO_W - gap * 2) / 3;

      const layout: PhotoItem[] = [
        { src: photos[0], x: 0,          y: 0,          w: colW, h: rowH },
        { src: photos[1], x: colW + gap,  y: 0,          w: colW, h: rowH },
      ];
      rest.forEach((src, i) => {
        layout.push({ src, x: i * (botW + gap), y: rowH + gap, w: botW, h: rowH });
      });
      return layout;
    }

    const photoLayout = getPhotoLayout();

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            position: "relative",
            overflow: "hidden",
            background: "#0d1218",
          }}
        >
          {/* 배경: 앨범아트 강한 블러 */}
          {albumArt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={albumArt}
              alt=""
              style={{
                position: "absolute",
                inset: "0",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(48px)",
                transform: "scale(1.2)",
              }}
            />
          )}

          {/* 어두운 오버레이 */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              background: "rgba(0,0,0,0.72)",
              display: "flex",
            }}
          />

          {/* 좌측: 사진 영역 — 전체 높이 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: PHOTO_W,
              height: PHOTO_H,
              display: "flex",
            }}
          >
            {photoLayout.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.src}
                alt=""
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: p.w,
                  height: p.h,
                  objectFit: "cover",
                  borderRadius: 0,
                  border: "none",
                }}
              />
            ))}
            {count === 0 && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                }}
              />
            )}
            {/* 사진 영역 우측 페이드 */}
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 80,
                height: "100%",
                background: "linear-gradient(to right, transparent, rgba(0,0,0,0.72))",
                display: "flex",
              }}
            />
          </div>

          {/* 우측: 곡 정보 영역 */}
          <div
            style={{
              position: "absolute",
              left: PHOTO_W,
              top: 0,
              width: 1200 - PHOTO_W,
              height: 630,
              display: "flex",
              flexDirection: "column",
              padding: "52px 56px",
              background: "rgba(0,0,0,0.0)",
            }}
          >
            {/* 상단 로고 */}
            <div
              style={{
                color: "#C4687A",
                fontSize: 18,
                letterSpacing: "0.15em",
              }}
            >
              Play the Picture
            </div>

            {/* 곡 정보: 세로 중앙 정렬 */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: 12,
                  padding: "28px 32px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: 56,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {song}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 32,
                    marginTop: 14,
                  }}
                >
                  {artist}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error("[og] 생성 실패:", e);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
