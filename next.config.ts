import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15.2+ App Router는 streaming metadata 기본 사용 → 일부 SNS 크롤러가
  // 메타 태그를 못 가져가는 문제 (페북·인스타·LinkedIn 등). 봇별 blocking metadata 강제.
  // Next.js 기본엔 Twitterbot·Slackbot만 포함 → Meta·LinkedIn·Discord 명시 추가 필요.
  // GitHub: vercel/next.js#44470 (App Router OG 미스크래핑)
  htmlLimitedBots: /facebookexternalhit|meta-externalagent|facebookcatalog|LinkedInBot|Slackbot-LinkExpanding|Discordbot|TelegramBot|WhatsApp/,
};

export default nextConfig;
