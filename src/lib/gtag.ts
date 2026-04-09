export const GA_ID = "G-CBTK3QZ0KQ";

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const w = window as Window & { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", name, params);
}
