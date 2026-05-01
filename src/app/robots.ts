import type { MetadataRoute } from "next";

const BASE_URL = "https://playthepicture.com";

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/admin/",
    "/share/",
    "/result",
    "/preference",
    "/journal",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: "Yeti", allow: "/", disallow },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
