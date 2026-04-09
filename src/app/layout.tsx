import type { Metadata } from "next";
import { Noto_Sans_KR, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { GA_ID } from "@/lib/gtag";

const notoSansKR = Noto_Sans_KR({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
});

const dmSans = DM_Sans({
  weight: ["300"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "플더픽 — 사진으로 지금 딱 맞는 노래 찾기",
  description: "오늘 찍은 사진으로 AI가 딱 맞는 한 곡을 추천해드려요 🎵",
  openGraph: {
    title: "플더픽 — 사진으로 지금 딱 맞는 노래 찾기",
    description: "오늘 찍은 사진으로 AI가 딱 맞는 한 곡을 추천해드려요 🎵",
    url: "https://play-the-picture.vercel.app",
    type: "website",
    images: [
      {
        url: "https://play-the-picture.vercel.app/api/og/default",
        width: 1200,
        height: 630,
        alt: "플더픽 — 사진으로 지금 딱 맞는 노래 찾기",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "플더픽 — 사진으로 지금 딱 맞는 노래 찾기",
    description: "오늘 찍은 사진으로 AI가 딱 맞는 한 곡을 추천해드려요 🎵",
    images: ["https://play-the-picture.vercel.app/api/og/default"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} ${dmSans.variable} h-full`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#0d1218" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
