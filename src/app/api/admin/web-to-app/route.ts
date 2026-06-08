import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// admin 대시보드와 동일 소스 — 운영자 본인 테스트 device 제외 (page.tsx:21 참고)
const INTERNAL_DEVICE_IDS = new Set(
  (process.env.NEXT_PUBLIC_INTERNAL_DEVICE_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

// result 페이지 웹→앱 전환 유도 모달(AppInstallSheet) 추가 시점 — 커밋 7dc7d63, 2026-05-23 19:13 KST.
// 이전 데이터는 모달 없이 일어난 자연 전환이라 모달 효과 측정을 흐림 → 이 시점 이후만 집계.
const MODAL_START_ISO = "2026-05-23T10:13:00Z";

// web→app 전환 측정 (handoff 6/7 §다음세션 4)
// analyze_logs는 web/app 분석을 같은 user_id로 모두 기록(platform 컬럼) → 단일 테이블로 측정.
// 전환 = 같은 user_id가 웹 분석(platform='web'/null) 후 앱 분석(platform='app')도 한 경우(웹이 먼저).
// 누적(all-time) 기준. 운영자 본인 계정(INTERNAL device에 연결된 user_id)은 제외.
type Row = { user_id: string; device_id: string | null; platform: string | null; created_at: string };

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // 로그인 유저(user_id 있음) 행만 페이지네이션으로 모두 fetch — PostgREST default max-rows 1000 우회
    const rows: Row[] = [];
    const pageSize = 1000;
    for (let from = 0; from < 200000; from += pageSize) { // 안전 상한
      const { data, error } = await supabaseAdmin
        .from("analyze_logs")
        .select("user_id, device_id, platform, created_at")
        .not("user_id", "is", null)
        .gte("created_at", MODAL_START_ISO)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.error("[admin/web-to-app] analyze_logs page:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as Row[]));
      if (data.length < pageSize) break;
    }

    // 내부 운영자 device에 연결된 user_id 수집 (이들은 전환 집계에서 제외)
    const internalUserIds = new Set<string>();
    for (const r of rows) {
      if (r.device_id && INTERNAL_DEVICE_IDS.has(r.device_id)) internalUserIds.add(r.user_id);
    }

    // user_id별 최초 웹 분석 / 최초 앱 분석 시각 계산 (내부 제외)
    const byUser = new Map<string, { firstWeb: number | null; firstApp: number | null }>();
    for (const r of rows) {
      if (internalUserIds.has(r.user_id)) continue;
      const t = new Date(r.created_at).getTime();
      const isApp = r.platform === "app";
      const u = byUser.get(r.user_id) ?? { firstWeb: null, firstApp: null };
      if (isApp) {
        if (u.firstApp === null || t < u.firstApp) u.firstApp = t;
      } else {
        // platform이 'web' 또는 null(구 웹 데이터) = 웹 분석
        if (u.firstWeb === null || t < u.firstWeb) u.firstWeb = t;
      }
      byUser.set(r.user_id, u);
    }

    let webUsers = 0, appUsers = 0, both = 0, webThenApp = 0;
    const convertDays: number[] = [];
    for (const u of byUser.values()) {
      if (u.firstWeb !== null) webUsers++;
      if (u.firstApp !== null) appUsers++;
      if (u.firstWeb !== null && u.firstApp !== null) {
        both++;
        if (u.firstWeb <= u.firstApp) {
          webThenApp++;
          convertDays.push((u.firstApp - u.firstWeb) / 86400000); // ms → days
        }
      }
    }

    const convRate = webUsers ? (webThenApp * 100) / webUsers : 0;
    const medianDays = median(convertDays);

    return NextResponse.json({
      web_users: webUsers,                 // 웹에서 분석한 로그인 유저 (분모)
      app_users: appUsers,                 // 앱에서 분석한 로그인 유저
      both,                                // 웹·앱 둘 다 경험
      web_then_app: webThenApp,            // 웹 먼저 → 앱 전환 (분자)
      conversion_rate_pct: Number(convRate.toFixed(1)),
      median_days_to_convert: medianDays === null ? null : Number(medianDays.toFixed(1)),
      app_only: appUsers - both,           // 웹 경험 없이 바로 앱 (참고)
    });
  } catch (e) {
    console.error("[admin/web-to-app] 오류:", e);
    return NextResponse.json(
      { web_users: 0, app_users: 0, both: 0, web_then_app: 0, conversion_rate_pct: 0, median_days_to_convert: null, app_only: 0 },
      { status: 500 }
    );
  }
}
