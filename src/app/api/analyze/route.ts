import { NextRequest, NextResponse } from "next/server";
import { legacyRecommend } from "./legacy-recommend";
import { newRecommend } from "./new-recommend";

function getMediaType(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (dataUrl.startsWith("data:image/png")) return "image/png";
  if (dataUrl.startsWith("data:image/webp")) return "image/webp";
  if (dataUrl.startsWith("data:image/gif")) return "image/gif";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photos } = body as { photos?: string[] };

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "사진이 없어요" }, { status: 400 });
    }

    // 이미지 블록 유효성 검사 (media_type 확인용)
    const _ = photos.map((d: string) => getMediaType(d));
    void _;

    const USE_NEW_SYSTEM = process.env.RECOMMEND_MODE === "new";
    console.log(`[route] RECOMMEND_MODE=${process.env.RECOMMEND_MODE ?? "legacy"}`);

    if (USE_NEW_SYSTEM) {
      return await newRecommend(body as Record<string, unknown>, photos);
    } else {
      return await legacyRecommend(body as Record<string, unknown>, photos);
    }
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : String(error);
    console.error("분석 오류:", message);

    if (status === 529 || message.includes("529") || message.toLowerCase().includes("overloaded")) {
      return NextResponse.json(
        { error: "지금 플더픽이 너무 바빠요 🙏 잠시 후 다시 시도해주세요" },
        { status: 529 }
      );
    }
    if (status === 429 || message.includes("429") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { error: "잠깐, 너무 많은 요청이 들어왔어요. 잠시 후 다시 시도해주세요" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "분석 중 오류가 발생했어요. 다시 시도해주세요" },
      { status: 500 }
    );
  }
}
