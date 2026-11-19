import { getDictionary, type Locale } from "@shared/i18n";
import { siteUrl } from "@shared/site-url";

/**
 * schema.org markup so search engines understand what the product is.
 * Deliberately has no prices, ratings or review counts: only facts that are
 * true regardless of how the plans are configured.
 */
export function StructuredData({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BizManager",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: t.meta.description,
    inLanguage: locale === "om" ? "om" : "en",
    url: `${siteUrl()}${locale === "om" ? "/om" : "/"}`,
  };
  // Escape "<" so the JSON can never close the script tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}