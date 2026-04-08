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

  // 카카오톡 스크래퍼가 외부 CDN 이미지에 직접 접근 못할 수 있어서 프록시 사용
  const ogImageUrl = data.album_art
    ? `https://play-the-picture.vercel.app/api/og-image?url=${encodeURIComponent(data.album_art)}`
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 600, height: 600 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  return <ShareClient id={id} />;
}
