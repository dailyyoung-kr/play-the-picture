import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
}
