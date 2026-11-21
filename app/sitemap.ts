import type { MetadataRoute } from "next";
import { LOCALES, homePathFor } from "@shared/i18n";
import { PUBLIC_PATHS, siteUrl } from "@shared/site-url";

const HOME_PATHS: readonly string[] = LOCALES.map(homePathFor);

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  // Every language homepage points at all the others.
  const languages = Object.fromEntries(
    LOCALES.map((l) => [l, `${base}${homePathFor(l) === "/" ? "/" : homePathFor(l)}`]),
  );
  return PUBLIC_PATHS.map((path) => {
    const isHome = HOME_PATHS.includes(path);
    return {
      url: `${base}${path === "/" ? "" : path}`,
      ...(isHome ? { alternates: { languages } } : {}),
      changeFrequency: isHome ? ("weekly" as const) : ("yearly" as const),
      priority: path === "/" ? 1 : isHome ? 0.9 : 0.3,
    };
  });
}