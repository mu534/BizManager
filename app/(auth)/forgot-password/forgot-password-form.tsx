"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordReset } from "@client/firebase/auth-client";
import { Button } from "@components/ui/button";
import { Field, Input } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { AuthLanguageLinks } from "@components/auth/auth-language-links";
import { resetRequestOutcome } from "@shared/auth-errors";
import type { Dictionary, Locale } from "@shared/i18n";

export default function ForgotPasswordForm({
  locale,
  t,
  languageLabel,
}: {
  locale: Locale;
  t: Dictionary["auth"];
  languageLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError(t.invalidEmail);
      return;
    }
    setEmailError(undefined);
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      const outcome = resetRequestOutcome(err, t);
      if (outcome.ok) setSent(true);
      else setError(outcome.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="mb-2 text-xl font-semibold text-ink-900">{t.forgotTitle}</h1>
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">{t.resetSent}</Alert>
          <Link href={`/sign-in?lang=${locale}`} className="inline-block text-sm font-medium text-brand-700 hover:underline">
            {t.backToSignIn}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-5 text-sm text-ink-600">{t.forgotIntro}</p>
          {error && (
            <div className="mb-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label={t.email} htmlFor="email" required hint={t.forgotNote} error={emailError}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                invalid={!!emailError}
                placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              {loading ? t.sendingReset : t.sendResetLink}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-600">
            <Link href={`/sign-in?lang=${locale}`} className="font-medium text-brand-700 hover:underline">
              {t.backToSignIn}
            </Link>
          </p>
        </>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <AuthLanguageLinks current={locale} label={languageLabel} />
      </div>
    </div>
  );
}