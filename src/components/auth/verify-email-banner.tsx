"use client";

import { useEffect, useState } from "react";
import {
  refreshEmailVerified,
  resendVerificationEmail,
  watchEmailVerification,
  type EmailVerificationState,
} from "@client/firebase/auth-client";
import { Alert } from "@components/ui/primitives";
import { Button } from "@components/ui/button";

const COOLDOWN_SECONDS = 60;

/**
 * Gentle reminder for email/password users who have not confirmed their email.
 * It never blocks the app: shops must keep selling. Hidden for Google sign-in
 * (already verified) and whenever Firebase has no signed-in user on this device.
 */
export function VerifyEmailBanner() {
  const [state, setState] = useState<EmailVerificationState>({ needsVerification: false, email: null });
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => watchEmailVerification(setState), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!state.needsVerification || dismissed) return null;

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      await resendVerificationEmail();
      setMessage("Verification email sent. Check your inbox and spam folder.");
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setMessage("Could not send the email. Check your connection and try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const verified = await refreshEmailVerified();
      if (verified) setState({ needsVerification: false, email: state.email });
      else setMessage("Not verified yet. Open the link in the email, then check again.");
    } catch {
      setMessage("Could not check right now. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <Alert
        tone="info"
        title="Verify your email address"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
            Hide
          </Button>
        }
      >
        <p>
          We sent a link to {state.email ?? "your email"}. Verifying keeps your account recoverable if you forget your
          password.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void resend()} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void check()} disabled={busy}>
            I have verified
          </Button>
        </div>
        {message && <p className="mt-2" role="status">{message}</p>}
      </Alert>
    </div>
  );
}