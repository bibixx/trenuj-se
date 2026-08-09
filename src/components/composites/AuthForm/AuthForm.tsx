import { IconBrandGoogleFilled } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { TextLink } from "../../primitives/TextLink/TextLink.tsx";
import { PageLayout } from "../PageLayout/PageLayout.tsx";
import { buildAbsoluteRedirectUrl, getPostAuthRedirect } from "../../../lib/auth-redirect.ts";
import { friendlyAuthError } from "../../../lib/auth-errors.ts";
import { supabase } from "../../../lib/supabase.ts";
import styles from "./AuthForm.module.css";

interface AuthFormProps {
  mode: "login" | "signup";
  initialEmail?: string;
  returnTo?: string;
}

export function AuthForm({ mode, initialEmail, returnTo }: AuthFormProps) {
  const isSignUp = mode === "signup";

  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "google" | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("password");

    if (isSignUp) {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name || undefined },
          emailRedirectTo: buildAbsoluteRedirectUrl(returnTo, window.location.origin),
        },
      });
      if (authError) {
        setError(friendlyAuthError(authError));
        setPending(null);
        return;
      }
      // Email confirmations enabled: no session yet — the user has to click the
      // link first. (Also covers the anti-enumeration response for existing emails.)
      if (data.user && !data.session) {
        setConfirmationSentTo(email);
        setPending(null);
        return;
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(friendlyAuthError(authError));
        setPending(null);
        return;
      }
    }

    window.location.assign(getPostAuthRedirect(returnTo));
  }

  async function handleGoogleSignIn() {
    setError(null);
    setPending("google");
    const redirectTo = buildAbsoluteRedirectUrl(returnTo, window.location.origin);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (authError) {
      setError(friendlyAuthError(authError));
      setPending(null);
    }
    // On success the browser is navigating away — keep the buttons disabled.
  }

  const switchTo = isSignUp ? "/login" : "/signup";

  if (confirmationSentTo) {
    return (
      <PageLayout centerHeader>
        <div className={styles.centered}>
          <Card className={styles.card}>
            <h1 className={styles.title}>Check your inbox</h1>
            <div role="status" className={styles.confirmText}>
              <p>
                We've sent a confirmation link to <strong className={styles.confirmEmail}>{confirmationSentTo}</strong>.
              </p>
              <p>Click the link in the email to confirm your account and sign in. It may take a minute to arrive — check your spam folder if you can't find it.</p>
            </div>
            <p className={styles.confirmSwitch}>
              Wrong email? <TextLink render={<button type="button" onClick={() => setConfirmationSentTo(null)} />}>Go back and try again</TextLink>
            </p>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout centerHeader>
      <div className={styles.centered}>
        <Card className={styles.card}>
          <h1 className={styles.title}>{isSignUp ? "Create account" : "Sign in"}</h1>
          <form onSubmit={handleSubmit} className={styles.form}>
            {isSignUp && <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {!isSignUp && (
              <p className={styles.forgotRow}>
                <TextLink render={<Link to="/reset-password" search={{ email: email || undefined, returnTo }} viewTransition={false} />}>Forgot password?</TextLink>
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={pending === "password"} disabled={pending !== null}>
              {isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
          <div className={styles.divider}>or</div>
          <Button
            variant="secondary"
            className={styles.googleButton}
            onClick={handleGoogleSignIn}
            loading={pending === "google"}
            disabled={pending !== null}
            icon={<IconBrandGoogleFilled />}
          >
            {isSignUp ? "Sign up with Google" : "Sign in with Google"}
          </Button>
          <p className={styles.modeSwitch}>
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <TextLink render={<Link to={switchTo} search={{ email: email || undefined, returnTo }} viewTransition={false} />}>{isSignUp ? "Sign in" : "Sign up"}</TextLink>
          </p>
        </Card>
      </div>
    </PageLayout>
  );
}
