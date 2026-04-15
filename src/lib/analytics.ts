/** 프로덕션에서만 analytics 이벤트를 전송한다. */
export const isAnalyticsEnabled = () =>
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true";
