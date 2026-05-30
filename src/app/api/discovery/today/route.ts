/**
 * GET /api/discovery/today?device_id=...
 *
 * "오늘의 발견" 카드 lazy generation + DB 캐싱.
 *
 * 흐름:
 *  1. device_id 받음 → entries 1건+ 있으면 활성, 없으면 신규
 *  2. cache_key 결정:
 *     - 활성 (로그인 + entries 1건+) → user_id (개인화)
 *     - 신규/비회원 → `common_${bucketOf(device_id) % BUCKET_COUNT}` (해시 버킷 분산)
 *  3. today_discovery (cache_key, today KST) 조회
 *     - 있음 → 즉시 반환
 *     - 없음 → generateDiscoveryCard() → DB upsert → 반환
 *  4. JSON 응답: { artist_1, artist_2, cache_key, generated }
 *
 * 응답시간: cache hit ~0.1초 / miss ~15초 (Apple Music + Claude)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateDiscoveryCard } from "@/lib/discovery-engine";

// Vercel Hobby plan timeout 60초 (default 10초) — 카드 첫 생성 ~15초 필요
export const maxDuration = 60;

// 콜드 스타트 버킷 수 — 5명의 신규 사용자가 통계적으로 5개의 서로 다른 카드를 받음
// 비용: 일 최대 5카드 × ~$0.02 = ~$0.10 (활성 사용자 비용 별도)
const BUCKET_COUNT = 5;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// KST 기준 yyyy-mm-dd
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * device_id 해시 버킷 — 같은 device는 매일 같은 버킷 (취향 일관성).
 * UUID v4 앞 8자리 hex → int 변환 후 mod.
 * UUID 형식이 아닌 경우 charCode 합산으로 fallback.
 */
function bucketOf(deviceId: string, bucketCount: number): number {
  const hex = deviceId.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16);
  if (Number.isFinite(n) && !Number.isNaN(n)) return n % bucketCount;
  // fallback: char code 합산
  let sum = 0;
  for (let i = 0; i < deviceId.length; i++) {
    sum = (sum + deviceId.charCodeAt(i)) >>> 0;
  }
  return sum % bucketCount;
}

async function isActiveUser(userId: string | null, deviceId: string): Promise<boolean> {
  // user_id 있으면 user_id 기준, 없으면 device_id 기준
  const q = supabaseAdmin
    .from("entries")
    .select("id", { count: "exact", head: true })
    .limit(1);
  const { count } = userId
    ? await q.eq("user_id", userId)
    : await q.eq("device_id", deviceId);
  return (count ?? 0) > 0;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id") || "";
  const userId = url.searchParams.get("user_id") || null;
  if (!deviceId) {
    return NextResponse.json({ error: "device_id 쿼리 필요" }, { status: 400 });
  }

  const today = todayKst();
  const active = await isActiveUser(userId, deviceId);
  // 캐시 키 우선순위:
  //   로그인 + entries 있음 → user_id (개인화)
  //   로그인 + entries 0건 → `common_${bucket}` (해시 버킷)
  //   비로그인 → `common_${bucket}` (해시 버킷)
  const bucket = bucketOf(deviceId, BUCKET_COUNT);
  const cacheKey = userId && active ? userId : `common_${bucket}`;
  // 공용 풀 캐시에는 개인 신호(vibe_description) 차단 — cache_key·생성 로직 일관성 보장
  const isColdBucket = cacheKey.startsWith("common_");

  // 1. DB 조회 (cache hit)
  const { data: cached } = await supabaseAdmin
    .from("today_discovery")
    .select("artist_1, artist_2, created_at")
    .eq("cache_key", cacheKey)
    .eq("date", today)
    .maybeSingle();

  if (cached) {
    console.log(`[discovery/today] cache HIT cache_key=${cacheKey} bucket=${bucket} date=${today}`);
    return NextResponse.json({
      artist_1: cached.artist_1,
      artist_2: cached.artist_2,
      cache_key: cacheKey,
      generated: false,
    });
  }

  // 2. 없으면 생성 → upsert → 반환
  console.log(`[discovery/today] cache MISS — 생성 시작 cache_key=${cacheKey} bucket=${bucket} date=${today} cold=${isColdBucket}`);
  const t0 = Date.now();
  let card;
  try {
    card = await generateDiscoveryCard(userId, deviceId, { forceColdStart: isColdBucket });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`[discovery/today] 생성 실패:`, msg);
    return NextResponse.json({ error: "오늘의 발견 생성 실패", detail: msg }, { status: 500 });
  }
  const generationMs = Date.now() - t0;
  console.log(`[discovery/today] 생성 완료 ${(generationMs / 1000).toFixed(1)}s`);

  // 3. DB 저장 (upsert — 동시 호출 시 두 번째도 안전)
  const { error: insertErr } = await supabaseAdmin
    .from("today_discovery")
    .upsert(
      {
        cache_key: cacheKey,
        date: today,
        artist_1: card.artist_1,
        artist_2: card.artist_2,
      },
      { onConflict: "cache_key,date" },
    );
  if (insertErr) {
    console.error(`[discovery/today] DB 저장 실패:`, insertErr.message);
    // 저장 실패해도 사용자에겐 결과 반환
  }

  return NextResponse.json({
    artist_1: card.artist_1,
    artist_2: card.artist_2,
    cache_key: cacheKey,
    generated: true,
    generation_ms: generationMs,
  });
}
