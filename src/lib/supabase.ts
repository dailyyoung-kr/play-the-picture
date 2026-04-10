import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
