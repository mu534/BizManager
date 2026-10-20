import type { Metadata } from "next";
import { Landing } from "@components/marketing/landing";
import { getDictionary } from "@shared/i18n";

const t = getDictionary("en");

export const metadata: Metadata = {
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: { canonical: "/", languages: { en: "/", om: "/om" } },
};

/** Public marketing homepage (English). Afaan Oromo lives at /om. */
export default function HomePage() {
  return <Landing locale="en" />;
}
