import { type FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { PageLayout } from "../PageLayout/PageLayout.tsx";
import { buildPasswordResetRedirectUrl, isRateLimitError } from "../../../lib/password-reset.ts";
import { supabase } from "../../../lib/supabase.ts";
import styles from "./AuthForm.module.css";

interface ResetPasswordRequestFormProps {
  initialEmail?: string;
  returnTo?: string;
}

export function ResetPasswordRequestForm({ initialEmail, returnTo }: ResetPasswordRequestFormProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetRedirectUrl(window.location.origin),
    });
    setPending(false);

    if (resetError && isRateLimitError(resetError)) {
      setError("Too many requests. Please wait a minute before trying again.");
      return;
    }

    // Any other outcome shows the neutral confirmation — Supabase already returns
    // success for unknown emails, and error-shape differences would leak whether
    // an account exists.
    setSent(true);
  }

  return (
    <PageLayout centerHeader>
      <div className={styles.centered}>
        <Card className={styles.card}>
          {sent ? (
            <>
              <h1 className={styles.title}>Check your email</h1>
              <div role="status" className={styles.confirmText}>
                <p>
                  If an account exists for <strong className={styles.confirmEmail}>{email}</strong>, we've sent a password reset link. It should arrive within a couple of minutes.
                </p>
              </div>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Reset password</h1>
              <form onSubmit={handleSubmit} className={styles.form}>
                <p className={styles.confirmText}>Enter your email address and we'll send you a link to reset your password.</p>
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </>
          )}
          <div className={styles.backRow}>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" search={{ email: email || undefined, returnTo }} viewTransition={false} />}>
              Back to sign in
            </Button>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
