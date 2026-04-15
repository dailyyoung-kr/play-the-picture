export const PIXEL_ID = "950900540860087";

type FbqFn = (
  action: string,
  event: string,
  params?: Record<string, unknown>
) => void;

function fbq(action: string, event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const w = window as Window & { fbq?: FbqFn };
  w.fbq?.(action, event, params);
}

/** 사진 업로드 완료 → 취향 선택 진입 시점 */
export function pixelInitiateCheckout() {
  fbq("track", "InitiateCheckout");
}

/** 분석 성공 → 결과 화면 렌더링 시점 */
export function pixelViewContent(song?: string) {
  fbq("track", "ViewContent", song ? { content_name: song } : undefined);
}

/** 공유하기 버튼 클릭 */
export function pixelLead(params?: Record<string, unknown>) {
  fbq("track", "Lead", params);
}
