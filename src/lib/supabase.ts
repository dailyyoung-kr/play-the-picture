import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// entries 테이블 RLS용: x-device-id 헤더 포함 클라이언트 (SELECT/INSERT/DELETE 시 사용)
export function getSupabaseWithDeviceId() {
  const deviceId = typeof window !== "undefined"
    ? (localStorage.getItem("ptp_device_id") ?? "")
    : "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "x-device-id": deviceId } } }
  );
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("ptp_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ptp_device_id", id);
  }
  return id;
}

export interface Entry {
  id: string;
  created_at: string;
  date: string;
  song: string;
  artist: string;
  reason: string;
  tags: string[];
  emotions: Record<string, number>;
  vibe_type: string;
  vibe_description: string;
  photos: string[];
  album_art?: string | null;
  device_id?: string | null;
}
