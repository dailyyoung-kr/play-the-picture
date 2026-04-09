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
    const photos: string[] = (data?.photos ?? []).slice(0, 2);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: "#0d1218",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* 앨범아트 배경 (저투명도) */}
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
                opacity: 0.18,
              }}
            />
          )}

          {/* 다크 그라디언트 오버레이 */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(to right, rgba(13,18,24,0.96) 0%, rgba(13,18,24,0.75) 60%, rgba(13,18,24,0.55) 100%)",
              display: "flex",
            }}
          />

          {/* 콘텐츠 레이어 */}
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              flexDirection: "column",
              padding: "56px 64px",
            }}
          >
            {/* 로고 */}
            <div
              style={{
                color: "#C4687A",
                fontSize: 18,
                letterSpacing: "0.2em",
                marginBottom: "auto",
              }}
            >
              Play the Picture
            </div>

            {/* 메인 콘텐츠 (하단) */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 48,
              }}
            >
              {/* 사진 (업로드된 경우) */}
              {photos.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexShrink: 0,
                  }}
                >
                  {photos.map((photo, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={photo}
                      alt=""
                      style={{
                        width: 180,
                        height: 224,
                        objectFit: "cover",
                        borderRadius: 12,
                        border: "1.5px solid rgba(255,255,255,0.2)",
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 곡 정보 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  flex: 1,
                }}
              >
                {/* 앨범아트 썸네일 */}
                {albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={albumArt}
                    alt=""
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 8,
                      objectFit: "cover",
                      marginBottom: 8,
                    }}
                  />
                )}
                <div
                  style={{
                    color: "#fff",
                    fontSize: photos.length > 0 ? 48 : 60,
                    fontWeight: 700,
                    lineHeight: 1.15,
                  }}
                >
                  {song}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 26,
                  }}
                >
                  {artist}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.28)",
                    fontSize: 17,
                    marginTop: 6,
                  }}
                >
                  플더픽에서 사진으로 추천받은 노래
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
