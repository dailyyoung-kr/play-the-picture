// UTM 파라미터 추적 유틸
// - 랜딩 페이지에서 URL ?utm_source=... 읽어 sessionStorage에 저장
// - analyze 시 sessionStorage에서 꺼내서 analyze_logs에 함께 기록
// - 세션 종료(탭 닫힘) 시 자동 소멸 (오래된 utm 재사용 방지)

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type UtmKey = typeof KEYS[number];

export type Utm = Partial<Record<UtmKey, string>>;

// URL 파라미터에 utm_*이 있으면 sessionStorage에 저장. 덮어쓰기 정책:
// 새 utm이 하나라도 오면 전체 교체 (캠페인 중간에 다른 광고 클릭 시 이후 행동 귀속)
export function captureUtmFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Utm = {};
    let hasAny = false;
    for (const k of KEYS) {
      const v = params.get(k);
      if (v) {
        found[k] = v.slice(0, 100); // 방어적 길이 제한
        hasAny = true;
      }
    }
    if (hasAny) {
      sessionStorage.setItem("ptp_utm", JSON.stringify(found));
    }
  } catch {
    // sessionStorage 접근 실패 (프라이빗 모드 등) — 무시
  }
}

export function getUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem("ptp_utm");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Utm;
    const out: Utm = {};
    for (const k of KEYS) {
      if (typeof parsed[k] === "string") out[k] = parsed[k];
    }
    return out;
  } catch {
    return {};
  }
}
