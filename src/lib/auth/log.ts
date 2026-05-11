import { getDeviceId } from "@/lib/supabase";

export type AuthEvent =
  | "gate_shown"
  | "google_login_start"
  | "google_login_success"
  | "apple_login_start"
  | "apple_login_success"
  | "guest_skip"
  | "anonymous_signin_success"
  | "anonymous_signin_failed"
  | "identity_link_start"
  | "identity_link_failed"
  | "signup_complete"
  | "nickname_changed"
  | "nickname_regenerated"
  | "device_migrated"
  | "save_prompt_shown"
  | "save_prompt_signup";

export async function logAuthEvent(
  event: AuthEvent,
  metadata?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: getDeviceId(),
        user_id: userId ?? null,
        event,
        metadata: metadata ?? null,
      }),
    });
  } catch (e) {
    console.error("[auth_log]", e);
  }
}
