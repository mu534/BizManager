import type { Metadata } from "next";
import { Landing } from "@components/marketing/landing";
import { StructuredData } from "@components/marketing/structured-data";
import { getDictionary } from "@shared/i18n";

const t = getDictionary("am");

export const metadata: Metadata = {
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: { canonical: "/am", languages: { en: "/", om: "/om", am: "/am" } },
};

/** Public marketing homepage (Amharic). */
export default function HomePageAm() {
  return (
    <>
      <StructuredData locale="am" />
      <Landing locale="am" />
    </>
  );
}