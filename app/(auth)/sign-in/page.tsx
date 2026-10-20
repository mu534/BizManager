import type { Metadata } from "next";
import { Suspense } from "react";
import SignInForm from "./sign-in-form";
import { resolveLocale } from "@server/i18n/resolve-locale";
import { getDictionary } from "@shared/i18n";

export const metadata: Metadata = { title: "Sign In" };
// Reads the language cookie / ?lang= — request-time, so not prerendered.
export const instant = false;

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await resolveLocale((await searchParams).lang);
  const dict = getDictionary(locale);
  return (
    <Suspense>
      <SignInForm locale={locale} t={dict.auth} languageLabel={dict.nav.language} />
    </Suspense>
  );
}
