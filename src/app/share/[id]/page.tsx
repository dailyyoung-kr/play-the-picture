import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import ShareClient from "./ShareClient";

type Props = { params: Promise<{ id: string }> };

async function fetchEntry(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("entries")
    .select("song, artist, album_art")
    .eq("id", id)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchEntry(id);

  if (!data) {
    return { title: "Play the Picture" };
  }

  const title = `${data.song} — ${data.artist}`;
  const description = "오늘의 사진으로 추천받은 노래예요. 나도 해볼까요? ✦";
  const url = `https://play-the-picture.vercel.app/share/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(data.album_art ? { images: [{ url: data.album_art, width: 600, height: 600 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(data.album_art ? { images: [data.album_art] } : {}),
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  return <ShareClient id={id} />;
}
