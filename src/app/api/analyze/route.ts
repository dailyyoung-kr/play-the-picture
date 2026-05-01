import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { newRecommend } from "./new-recommend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Rate limit 임계값 — 실유저 상위 케이스(최대 33회/일) 보호 + 어뷰저 차단
// 2026-04-30: 시간당 15 → 20 완화. 4월 누적 6건 모두 광고 유입 정상 헤비유저(13~19분간 14~15회).
// 2026-05-01: 시간당 20 → 25 완화. 5/1 컬렉터형 헤비유저(K-pop 19회 시도 후 차단) 발생.
//             비용 BEP(CAC ₩500 / 회당 ₩35 = 14회) 대비 25는 viral 헤비유저 보호 우선,
//             분당 5 + 일당 50 cap이 어뷰저(시간당 50+)는 그대로 차단.
const RATE_LIMITS = {
  perMinute: 5,   // 분당 5회: 인간 물리적 한계(분당 2회)의 2배 (봇 방어)
  perHour: 25,    // 시간당 25회: viral 헤비유저 보호 (시간당 50+ 어뷰저는 분당 5/일당 50 cap이 차단)
  perDay: 50,     // 일당 50회: 최대 33회 파워유저 보호 + 극단 어뷰저 차단
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photos, deviceId } = body as { photos?: string[]; deviceId?: string };

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "사진이 없어요", error_code: "no_photos" }, { status: 400 });
    }

    // ── Device Rate Limit: 분당 5 / 시간당 20 / 일당 50 ──
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

        // 어느 한도가 가장 빨리 풀리는지 계산해서 정확한 retry 시점 안내
        let windowMs = 60_000;
        let limit = RATE_LIMITS.perMinute;
        let unit: "분당" | "시간당" | "일당" = "분당";
        if (dayCount > RATE_LIMITS.perDay) {
          windowMs = 86_400_000; limit = RATE_LIMITS.perDay; unit = "일당";
        } else if (hourCount > RATE_LIMITS.perHour) {
          windowMs = 3_600_000; limit = RATE_LIMITS.perHour; unit = "시간당";
        }

        // 윈도우 내 가장 오래된 요청 시각 + windowMs = 풀리는 시점
        const { data: oldestRow } = await supabaseAdmin
          .from("analyze_logs")
          .select("created_at")
          .eq("device_id", deviceId)
          .gte("created_at", new Date(now - windowMs).toISOString())
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        let waitMsg = "잠시 후";
        let retryAfterSec = 60;
        if (oldestRow?.created_at) {
          const oldestMs = new Date(oldestRow.created_at).getTime();
          const retryAtMs = oldestMs + windowMs;
          retryAfterSec = Math.max(1, Math.ceil((retryAtMs - now) / 1000));
          if (retryAfterSec <= 60) {
            waitMsg = "1분 안에";
          } else if (retryAfterSec < 3600) {
            waitMsg = `약 ${Math.ceil(retryAfterSec / 60)}분 후`;
          } else {
            waitMsg = `약 ${Math.ceil(retryAfterSec / 3600)}시간 후`;
          }
        }

        return NextResponse.json(
          {
            error: `${waitMsg} 다시 시도 가능해요 (${unit} ${limit}회 한도) 🙏`,
            error_code: "device_rate_limit",
            retry_after_sec: retryAfterSec,
          },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
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
