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

    // 사진 레이아웃 계산
    const count = photos.length;
    // 사진 영역: 좌측 530px, 우측 530px, 여백 각 35px
    const photoAreaW = 490;
    const photoAreaH = 430;

    // count별 사진 크기/위치 계산
    type PhotoLayout = { src: string; x: number; y: number; w: number; h: number }[];

    function getPhotoLayout(): PhotoLayout {
      if (count === 0) return [];

      const gap = 10;

      if (count === 1) {
        return [{ src: photos[0], x: 0, y: 0, w: photoAreaW, h: photoAreaH }];
      }

      if (count === 2) {
        const w = (photoAreaW - gap) / 2;
        return [
          { src: photos[0], x: 0, y: 0, w, h: photoAreaH },
          { src: photos[1], x: w + gap, y: 0, w, h: photoAreaH },
        ];
      }

      if (count === 3) {
        const topW = (photoAreaW - gap) / 2;
        const topH = (photoAreaH - gap) / 2;
        const botW = photoAreaW;
        const botH = topH;
        return [
          { src: photos[0], x: 0, y: 0, w: topW, h: topH },
          { src: photos[1], x: topW + gap, y: 0, w: topW, h: topH },
          { src: photos[2], x: 0, y: topH + gap, w: botW, h: botH },
        ];
      }

      // 4~5장: 첫 줄 2개 + 둘째 줄 나머지
      const topH = (photoAreaH - gap) / 2;
      const botH = topH;
      const topW = (photoAreaW - gap) / 2;
      const rest = photos.slice(2);
      const botCount = rest.length;
      const botW = botCount === 1 ? photoAreaW : botCount === 2 ? (photoAreaW - gap) / 2 : (photoAreaW - gap * 2) / 3;

      const layout: PhotoLayout = [
        { src: photos[0], x: 0, y: 0, w: topW, h: topH },
        { src: photos[1], x: topW + gap, y: 0, w: topW, h: topH },
      ];
      rest.forEach((src, i) => {
        layout.push({ src, x: i * (botW + gap), y: topH + gap, w: botW, h: botH });
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
          {/* 배경: 앨범아트 블러 */}
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
                filter: "blur(40px)",
                transform: "scale(1.15)",
              }}
            />
          )}

          {/* 어두운 오버레이 */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              background: "rgba(0,0,0,0.55)",
              display: "flex",
            }}
          />

          {/* 전체 콘텐츠 레이어 */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              flexDirection: "column",
              padding: "44px 52px",
            }}
          >
            {/* 상단 로고 */}
            <div
              style={{
                color: "#C4687A",
                fontSize: 18,
                letterSpacing: "0.15em",
                marginBottom: 36,
              }}
            >
              Play the Picture
            </div>

            {/* 메인 영역: 좌(사진) + 우(곡 정보) */}
            <div
              style={{
                display: "flex",
                flex: 1,
                gap: 56,
                alignItems: "center",
              }}
            >
              {/* 좌측: 사진 영역 */}
              <div
                style={{
                  width: 490,
                  height: 430,
                  flexShrink: 0,
                  position: "relative",
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
                      borderRadius: 8,
                      border: "1.5px solid rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
                {/* 사진이 없을 때 빈 플레이스홀더 */}
                {count === 0 && (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.06)",
                      border: "1.5px solid rgba(255,255,255,0.12)",
                      display: "flex",
                    }}
                  />
                )}
              </div>

              {/* 우측: 곡 정보 */}
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
                    color: "#fff",
                    fontSize: 52,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {song}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 28,
                    marginTop: 12,
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
