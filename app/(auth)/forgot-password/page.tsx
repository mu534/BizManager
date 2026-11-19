import type { Metadata } from "next";
import { resolveLocale } from "@server/i18n/resolve-locale";
import { getDictionary } from "@shared/i18n";
import ForgotPasswordForm from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };
// Reads the language cookie / ?lang= — request-time, so not prerendered.
export const instant = false;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = await resolveLocale((await searchParams).lang);
  const dict = getDictionary(locale);
  return <ForgotPasswordForm locale={locale} t={dict.auth} languageLabel={dict.nav.language} />;
}