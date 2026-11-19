import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@shared/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    // The two language homepages point at each other.
    ...(path === "/" || path === "/om"
      ? { alternates: { languages: { en: `${base}/`, om: `${base}/om` } } }
      : {}),
    changeFrequency: path === "/" || path === "/om" ? ("weekly" as const) : ("yearly" as const),
    priority: path === "/" ? 1 : path === "/om" ? 0.9 : 0.3,
  }));
}