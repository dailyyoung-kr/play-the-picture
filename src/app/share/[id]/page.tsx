import { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import ShareClient, { ShareEntryLite } from "./ShareClient";

type Props = { params: Promise<{ id: string }> };

// React.cache: 같은 요청 내에서 generateMetadata + SharePage가 공유하도록 1회만 DB 조회
const fetchEntryLite = cache(async (id: string): Promise<ShareEntryLite | null> => {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // photos 제외한 본문만 — SSR HTML을 가볍게 유지
  const { data } = await supabaseAdmin
    .from("entries")
    .select("id, song, artist, reason, tags, vibe_type, vibe_description, album_art")
    .eq("id", id)
    .single();
  return (data as ShareEntryLite) ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchEntryLite(id);

  if (!data) {
    return { title: "Play the Picture" };
  }

  const vibeType = data.vibe_type ?? "";
  const title = vibeType
    ? `${vibeType}의 오늘의 노래`
    : `${data.song} — ${data.artist}`;
  const description = `${data.song} — ${data.artist}. 사진에서 어떤 노래가 나올지 궁금하다면?`;
  const url = `https://play-the-picture.vercel.app/share/${id}`;

  const ogImageUrl = `https://play-the-picture.vercel.app/api/og?id=${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const initialEntry = await fetchEntryLite(id);
  return <ShareClient id={id} initialEntry={initialEntry} />;
}
