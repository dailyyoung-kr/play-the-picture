import { NextRequest, NextResponse } from "next/server";
import { newRecommend } from "./new-recommend";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photos } = body as { photos?: string[] };

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "사진이 없어요", error_code: "no_photos" }, { status: 400 });
    }

    return await newRecommend(body as Record<string, unknown>, photos);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    console.error("분석 오류:", message);

    // 한도 초과 (Anthropic 월 한도) — overloaded보다 먼저 체크
    if (
      lower.includes("usage limit") ||
      lower.includes("reached your specified") ||
      lower.includes("credit balance")
    ) {
      return NextResponse.json(
        { error: "잠시 점검 중이에요. 곧 돌아올게요 🙏", error_code: "usage_limit" },
        { status: 503 }
      );
    }
    if (status === 529 || message.includes("529") || lower.includes("overloaded")) {
      return NextResponse.json(
        { error: "지금 플더픽이 너무 바빠요 🙏 잠시 후 다시 시도해주세요", error_code: "overloaded" },
        { status: 529 }
      );
    }
    if (status === 429 || message.includes("429") || lower.includes("rate limit")) {
      return NextResponse.json(
        { error: "잠깐, 너무 많은 요청이 들어왔어요. 잠시 후 다시 시도해주세요", error_code: "rate_limit" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "분석 중 오류가 발생했어요. 다시 시도해주세요", error_code: "unknown" },
      { status: 500 }
    );
  }
}
