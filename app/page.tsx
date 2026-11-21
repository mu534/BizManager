import type { Metadata } from "next";
import { Landing } from "@components/marketing/landing";
import { StructuredData } from "@components/marketing/structured-data";
import { getDictionary } from "@shared/i18n";

const t = getDictionary("en");

export const metadata: Metadata = {
  title: { absolute: t.meta.title },
  description: t.meta.description,
  alternates: { canonical: "/", languages: { en: "/", om: "/om", am: "/am" } },
};


export default function HomePage() {
  return (
    <>
      <StructuredData locale="en" />
      <Landing locale="en" />
    </>
  );
}