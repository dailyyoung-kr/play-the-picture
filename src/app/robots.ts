import type { MetadataRoute } from "next";

const BASE_URL = "https://playthepicture.com";

// SNS 크롤러는 /share/ 허용 (OG 미리보기 위해)
// 일반 검색엔진은 /share/ 차단 유지 (사용자 entry 데이터 검색 색인 방지)
const SNS_CRAWLERS = [
  "facebookexternalhit",  // Facebook, Instagram (구버전), WhatsApp
  "meta-externalagent",   // Meta 2024+ 통합 크롤러 (Threads·인스타 OG·Meta AI)
  "facebookcatalog",      // Facebook Catalog
  "Twitterbot",           // Twitter / X
  "LinkedInBot",          // LinkedIn
  "Slackbot",             // Slack
  "Slackbot-LinkExpanding", // Slack 미리보기 전용
  "Discordbot",           // Discord
  "TelegramBot",          // Telegram
  "WhatsApp",             // WhatsApp 자체 UA
];

export default function robots(): MetadataRoute.Robots {
  const generalDisallow = [
    "/api/",
    "/admin/",
    "/share/",
    "/result",
    "/preference",
    "/journal",
  ];
  // SNS 봇은 /share/ 허용 + /api/og 허용 (og:image 동적 생성 endpoint)
  // 5/4 Vercel logs 분석: 페북이 share 페이지는 200으로 fetch했지만 og:image (/api/og) 는
  // /api/ Disallow로 차단 → 페북 디버거 "robots.txt block" + OG 카드 미노출
  const snsDisallow = generalDisallow.filter((p) => p !== "/share/");

  return {
    rules: [
      // SNS 봇: /share/ + /api/og 허용. /api/ 그 외 (admin·log 등)만 차단
      ...SNS_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: ["/", "/api/og"],
        disallow: snsDisallow,
      })),
      { userAgent: "*", allow: "/", disallow: generalDisallow },
      { userAgent: "Yeti", allow: "/", disallow: generalDisallow },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
