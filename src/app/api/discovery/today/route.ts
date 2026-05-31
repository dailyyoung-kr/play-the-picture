/**
 * GET /api/discovery/today
 *  쿼리: device_id (필수), user_id (선택)
 *
 *  흐름:
 *  1. 시드 판정 (getUserContext) — 저장/공유/스토리한 아티스트(가수 단위) 수
 *  2. 시드 0개 → { blocked: true } (카드 생성 안 함, 클라가 안내 UI 표시)
 *  3. 시드 1+ → cache_key(userId 또는 device_) 로 today_discovery 캐시 조회
 *  4. 캐시 MISS → generateDiscoveryCard (시드 1=하이브리드 / 2+=각각 1명)
 *  5. JSON 응답: { artist_1, artist_2, cache_key, generated, blocked }
 *
 *  생성 비용: Claude 1회 + Apple Music 다수 호출 → 캐시 우선
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateDiscoveryCard, getUserContext } from "@/lib/discovery-engine";

// Vercel Hobby plan timeout 60초 (default 10초) — 카드 첫 생성 ~15초 필요
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id") || "";
  const userId = url.searchParams.get("user_id") || null;
  // 새 클라(웹·새 앱)는 supports_blocked=1 전송 → blocked 안내화면 처리 가능.
  // 구버전 앱은 못 보냄 → 시드 0개여도 콜드 카드를 정상 카드처럼 받아 안 깨짐.
  //
  // TODO(구버전 앱 호환 제거): supports_blocked를 보내는 앱 버전이 충분히 퍼지면
  //   아래 콜드 폴백 분기를 제거하고 "시드 0개 = 무조건 blocked"로 단순화할 것.
  //   - 제거 조건: "supports_blocked 없이 forceCold 탄 요청"이 거의 0 (구버전 앱 사용률 < 5%)
  //   - 확인 방법: 이 라우트 로그의 `forceCold=true`(아래 cache MISS 로그)에서
  //     supports_blocked 미전송 비율 모니터링. 거의 0이면 supportsBlocked 분기·cold_ 캐시키 삭제 가능.
  const supportsBlocked = url.searchParams.get("supports_blocked") === "1";
  if (!deviceId) {
    return NextResponse.json({ error: "device_id 쿼리 필요" }, { status: 400 });
  }

  const today = todayKst();

  // 1. 시드 판정 (게이트) — 저장/공유/스토리한 아티스트(가수 단위) 수
  const userCtx = await getUserContext(userId, deviceId);
  // 시드 0개: 새 클라는 blocked 안내, 구버전 앱은 콜드 카드(forceCold)로 폴백
  const forceCold = userCtx.seedCount === 0;
  if (forceCold && supportsBlocked) {
    console.log(
      `[discovery/today] blocked — 시드 0개 (user=${userId ?? "none"} device=${deviceId})`,
    );
    return NextResponse.json({ blocked: true });
  }

  // 2. 캐시 키 — 로그인 유저는 user_id, 비로그인(직접 호출)은 device_.
  //    콜드 폴백 카드는 개인 신호가 없으니 공용 콜드 캐시(cold_*)로 분리 — 개인 키 오염 방지.
  const cacheKey = forceCold ? `cold_${deviceId}` : userId ?? `device_${deviceId}`;

  // 3. 캐시 조회 (cache hit)
  const { data: cached } = await supabaseAdmin
    .from("today_discovery")
    .select("artist_1, artist_2")
    .eq("cache_key", cacheKey)
    .eq("date", today)
    .maybeSingle();

  if (cached) {
    console.log(`[discovery/today] cache HIT cache_key=${cacheKey} date=${today}`);
    return NextResponse.json({
      artist_1: cached.artist_1,
      artist_2: cached.artist_2,
      cache_key: cacheKey,
      generated: false,
      blocked: false,
    });
  }

  // 4. 없으면 생성 (시드 분기·forceCold는 generateDiscoveryCard 내부) → upsert → 반환
  console.log(
    `[discovery/today] cache MISS — 생성 시작 cache_key=${cacheKey} date=${today} seedCount=${userCtx.seedCount} forceCold=${forceCold}`,
  );
  const t0 = Date.now();
  let card;
  try {
    card = await generateDiscoveryCard(userId, deviceId, userCtx, { forceCold });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`[discovery/today] 생성 실패:`, msg);
    return NextResponse.json(
      { error: "오늘의 발견 생성 실패", detail: msg },
      { status: 500 },
    );
  }
  const generationMs = Date.now() - t0;
  console.log(`[discovery/today] 생성 완료 ${(generationMs / 1000).toFixed(1)}s`);

  // 5. DB 저장 (upsert — 동시 호출 시 두 번째도 안전)
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
    blocked: false,
  });
}
