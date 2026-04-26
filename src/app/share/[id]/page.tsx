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
    .select("song, artist, album_art, vibe_type")
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
  const songLine = `${data.song} — ${data.artist}`;

  // #2 og:title — vibeType이 카드의 호기심 훅 (캐릭터명 → "뭐지?" 클릭 유발)
  //   vibeType 누락 시에만 곡 정보로 fallback
  const title = vibeType
    ? `${vibeType}의 오늘의 노래`
    : songLine;

  // #3 og:description — 정적 CTA형 카피 (truncation 0%, 수신자 본인 케이스 호기심 자극)
  //   4/20 베이스라인("사진에서 어떤 노래가 나올지 궁금하다면?") 패턴 회귀
  const description = "내 사진엔 어떤 노래가 어울릴까?";
  const url = `https://playthepicture.com/share/${id}`;

  const ogImageUrl = `https://playthepicture.com/api/og?id=${id}`;

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
