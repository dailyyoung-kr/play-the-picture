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
        // 1+2 레이아웃: 좌측 풀높이 메인 + 우측 상하 2개
        // 기존 2상+1하(전체폭)은 하단이 1.68:1 가로 띠라 인물·세로 사진 잘림 심함
        const colW = (PHOTO_W - gap) / 2;
        const rowH = (PHOTO_H - gap) / 2;
        return [
          { src: photos[0], x: 0,          y: 0,          w: colW, h: PHOTO_H },
          { src: photos[1], x: colW + gap, y: 0,          w: colW, h: rowH },
          { src: photos[2], x: colW + gap, y: rowH + gap, w: colW, h: rowH },
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
          {/* 우측 680px 앨범아트 영역 — 공유 페이지와 동일 시각 언어 */}
          {albumArt && (
            <>
              {/* 1) 블러 배경 — 분위기용 (40px → 20px로 단순화, satori 렌더링 비용 감소) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={albumArt}
                alt=""
                style={{
                  position: "absolute",
                  left: PHOTO_W,
                  top: 0,
                  width: 1200 - PHOTO_W,
                  height: PHOTO_H,
                  objectFit: "cover",
                  filter: "blur(20px) brightness(0.55)",
                  transform: "scale(1.5)",
                }}
              />
              {/* 2) 선명한 앨범아트 본체 — blur 제거로 식별성 ↑ + 빌드 비용 ↓ */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={albumArt}
                alt=""
                style={{
                  position: "absolute",
                  left: PHOTO_W,
                  top: 0,
                  width: 1200 - PHOTO_W,
                  height: PHOTO_H,
                  objectFit: "contain",
                  filter: "brightness(0.95)",
                }}
              />
              {/* 3) 하단 그라디언트 — 곡명 박스 가독성 (평평한 오버레이 대체) */}
              <div
                style={{
                  position: "absolute",
                  left: PHOTO_W,
                  top: 0,
                  width: 1200 - PHOTO_W,
                  height: PHOTO_H,
                  background:
                    "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.75) 100%)",
                  display: "flex",
                }}
              />
            </>
          )}

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
            {/* 사진 영역 우측 페이드 — 사진 가림 최소화로 폭·어둡기 모두 축소 */}
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 40,
                height: "100%",
                background: "linear-gradient(to right, transparent, rgba(0,0,0,0.4))",
                display: "flex",
              }}
            />
          </div>

          {/* 상단 좌측 로고 */}
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 52,
              color: "#C4687A",
              fontSize: 18,
              letterSpacing: "0.15em",
              display: "flex",
            }}
          >
            Play the Picture
          </div>

          {/* 우측 하단: 곡명 박스 */}
          <div
            style={{
              position: "absolute",
              bottom: 40,
              right: 40,
              background: "rgba(0,0,0,0.35)",
              borderRadius: 12,
              padding: "16px 22px",
              display: "flex",
              flexDirection: "column",
              width: 560,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                color: "#ffffff",
                fontSize: 48,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-0.5px",
                // satori가 wrap된 텍스트 height를 1줄로 측정해 artist가 겹쳐 그려지는 문제 회피.
                // 2줄 분량(48*1.2*2=115.2 → 116) 고정. alignItems flex-end로
                // 짧은 곡명 시 박스 하단 정렬되어 artist와 자연스러운 간격 유지.
                height: 116,
                overflow: "hidden",
              }}
            >
              {song}
            </div>
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.8)",
                fontSize: 32,
                marginTop: 12,
              }}
            >
              {artist}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          // entry는 immutable이므로 영구 캐시 안전.
          // 첫 호출만 ImageResponse 빌드(4~6초), 이후 모든 요청은 Vercel edge 캐시에서 ~20ms.
          // 카톡 크롤러가 timeout 만나는 문제를 근본적으로 해결.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      }
    );
  } catch (e) {
    console.error("[og] 생성 실패:", e);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
