import type { Metadata } from "next";
import { Suspense } from "react";
import SignUpForm from "./sign-up-form";
import { resolveLocale } from "@server/i18n/resolve-locale";
import { getDictionary } from "@shared/i18n";

export const metadata: Metadata = { title: "Create Account" };
// Reads the language cookie / ?lang= — request-time, so not prerendered.
export const instant = false;

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await resolveLocale((await searchParams).lang);
  const dict = getDictionary(locale);
  return (
    <Suspense>
      <SignUpForm locale={locale} t={dict.auth} languageLabel={dict.nav.language} />
    </Suspense>
  );
}
