import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import ShareClient from "./ShareClient";

type Props = { params: Promise<{ id: string }> };

async function fetchEntry(id: string) {
  // supabaseAdmin 사용: RLS 활성화 후에도 OG 메타데이터 생성 정상 동작
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabaseAdmin
    .from("entries")
    .select("song, artist, album_art, vibe_type, vibe_description")
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

  const vibeType = (data.vibe_type ?? "").trim();
  const vibeDescription = (data.vibe_description ?? "").trim();

  // #2 og:title — 항상 "song — artist" (플더픽 UI 일관성)
  const title = `${data.song} — ${data.artist}`;

  // #3 og:description — vibeDescription이 바이럴 자산. 없으면 브랜드 fallback
  //   vibeType만 누락: "플더픽이 추천한 오늘의 노래"
  //   둘 다 누락 (legacy): "플더픽에서 새로운 노래를 발견해보세요"
  const description = vibeDescription
    ? vibeDescription
    : vibeType
    ? "플더픽이 추천한 오늘의 노래"
    : "플더픽에서 새로운 노래를 발견해보세요";
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
  return <ShareClient id={id} />;
}
