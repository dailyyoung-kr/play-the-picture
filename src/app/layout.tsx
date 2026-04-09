import type { Metadata } from "next";
import { Noto_Sans_KR, DM_Sans } from "next/font/google";
import "./globals.css";

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
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
