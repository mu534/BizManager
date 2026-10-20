import type { Metadata } from "next";
import { Landing } from "@components/marketing/landing";
import { getDictionary } from "@shared/i18n";

const t = getDictionary("om");

export const metadata: Metadata = {
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: { canonical: "/om", languages: { en: "/", om: "/om" } },
};

/** Public marketing homepage (Afaan Oromoo). */
export default function HomePageOm() {
  return <Landing locale="om" />;
}
