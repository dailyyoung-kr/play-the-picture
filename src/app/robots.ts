import type { MetadataRoute } from "next";

const BASE_URL = "https://playthepicture.com";

// SNS 크롤러는 /share/ 허용 (OG 미리보기 위해)
// 일반 검색엔진은 /share/ 차단 유지 (사용자 entry 데이터 검색 색인 방지)
const SNS_CRAWLERS = [
  "facebookexternalhit",  // Facebook, Instagram, WhatsApp
  "Twitterbot",           // Twitter / X
  "LinkedInBot",          // LinkedIn
  "Slackbot",             // Slack
  "Discordbot",           // Discord
  "TelegramBot",          // Telegram
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
  const snsDisallow = generalDisallow.filter((p) => p !== "/share/");

  return {
    rules: [
      ...SNS_CRAWLERS.map((ua) => ({ userAgent: ua, allow: "/", disallow: snsDisallow })),
      { userAgent: "*", allow: "/", disallow: generalDisallow },
      { userAgent: "Yeti", allow: "/", disallow: generalDisallow },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
