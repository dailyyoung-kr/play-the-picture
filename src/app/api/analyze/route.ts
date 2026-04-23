import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { newRecommend } from "./new-recommend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Rate limit 임계값 — 실유저 상위 케이스(최대 33회/일) 보호 + 어뷰저 차단
const RATE_LIMITS = {
  perMinute: 5,   // 분당 5회: 인간 물리적 한계(분당 2회)의 2배
  perHour: 15,    // 시간당 15회: 평균 페이스 어뷰저 차단
  perDay: 50,     // 일당 50회: 최대 33회 파워유저 보호 + 극단 어뷰저 차단
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photos, deviceId } = body as { photos?: string[]; deviceId?: string };

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "사진이 없어요", error_code: "no_photos" }, { status: 400 });
    }

    // ── Device Rate Limit: 분당 5 / 시간당 15 / 일당 50 ──
    // /preference에서 이미 status="start" 로그 insert 후 호출되므로 본인 포함 count
    if (deviceId) {
      const now = Date.now();
      const [minuteRes, hourRes, dayRes] = await Promise.all([
        supabaseAdmin.from("analyze_logs").select("id", { count: "exact", head: true })
          .eq("device_id", deviceId).gte("created_at", new Date(now - 60_000).toISOString()),
        supabaseAdmin.from("analyze_logs").select("id", { count: "exact", head: true })
          .eq("device_id", deviceId).gte("created_at", new Date(now - 3_600_000).toISOString()),
        supabaseAdmin.from("analyze_logs").select("id", { count: "exact", head: true })
          .eq("device_id", deviceId).gte("created_at", new Date(now - 86_400_000).toISOString()),
      ]);
      const minuteCount = minuteRes.count ?? 0;
      const hourCount = hourRes.count ?? 0;
      const dayCount = dayRes.count ?? 0;

      if (
        minuteCount > RATE_LIMITS.perMinute ||
        hourCount > RATE_LIMITS.perHour ||
        dayCount > RATE_LIMITS.perDay
      ) {
        console.warn(`[device_rate_limit] device=${deviceId} min=${minuteCount} hour=${hourCount} day=${dayCount}`);
        return NextResponse.json(
          { error: "요청 가능한 분석 횟수를 초과했어요. 잠시 후 다시 시도해주세요 🙏", error_code: "device_rate_limit" },
          { status: 429 }
        );
      }
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
