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
  title: "Play the Picture",
  description: "사진으로 오늘의 노래를 찾아드려요",
  openGraph: {
    title: "Play the Picture",
    description: "사진으로 오늘의 노래를 찾아드려요",
    url: "https://play-the-picture.vercel.app",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Play the Picture",
    description: "사진으로 오늘의 노래를 찾아드려요",
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
