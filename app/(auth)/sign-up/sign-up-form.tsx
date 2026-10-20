"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpWithEmail, signInWithGoogle } from "@client/firebase/auth-client";
import { Button } from "@components/ui/button";
import { Field, Input } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { AuthLanguageLinks } from "@components/auth/auth-language-links";
import { GoogleIcon } from "@components/auth/google-icon";
import { authErrorMessage } from "@shared/auth-errors";
import type { Dictionary, Locale } from "@shared/i18n";

export default function SignUpForm({ locale, t, languageLabel }: { locale: Locale; t: Dictionary["auth"]; languageLabel: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = t.nameRequired;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = t.invalidEmail;
    if (password.length < 8) errs.password = t.passwordMin;
    setFieldErrors(errs);
    setError(null);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await signUpWithEmail(name.trim(), email.trim(), password);
      router.push("/create-business");
    } catch (err) {
      setError(authErrorMessage(err, t));
      setLoading(false);
    }
  }

  async function handleGoogle() {
    // No state updates before the popup opens: they would break the user-gesture
    // chain and cause auth/popup-blocked.
    try {
      await signInWithGoogle();
      setLoading(true);
      router.push("/app");
    } catch (err) {
      setError(authErrorMessage(err, t));
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="mb-5 text-xl font-semibold text-ink-900">{t.signUpTitle}</h1>
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label={t.name} htmlFor="name" required error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} invalid={!!fieldErrors.name} placeholder={t.namePlaceholder} />
        </Field>
        <Field label={t.email} htmlFor="email" required error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} invalid={!!fieldErrors.email} placeholder="you@example.com" />
        </Field>
        <Field label={t.password} htmlFor="password" required hint={t.passwordHint} error={fieldErrors.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} invalid={!!fieldErrors.password} />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          {loading ? t.creating : t.createAccount}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-500">
        <span className="h-px flex-1 bg-line" />
        {t.or}
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" onClick={handleGoogle} disabled={loading} className="w-full">
        <GoogleIcon />
        {t.google}
      </Button>

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.haveAccount}{" "}
        <Link href={`/sign-in?lang=${locale}`} className="font-medium text-brand-700 hover:underline">
          {t.signIn}
        </Link>
      </p>
      <div className="mt-4 border-t border-line pt-4">
        <AuthLanguageLinks current={locale} label={languageLabel} />
      </div>
    </div>
  );
}
