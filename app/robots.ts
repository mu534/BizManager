import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteUrl } from "@shared/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}