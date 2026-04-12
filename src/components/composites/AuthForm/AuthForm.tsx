import { IconBrandGoogleFilled } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { PageLayout } from "../PageLayout/PageLayout.tsx";
import { supabase } from "../../../lib/supabase.ts";
import styles from "./AuthForm.module.css";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const isSignUp = mode === "signup";
  const navigate = useNavigate();
  const { email: initialEmail } = useSearch({ strict: false }) as { email?: string };

  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSignUp) {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || undefined } },
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate({ to: "/" });
  }

  async function handleGoogleSignIn() {
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (authError) {
      setError(authError.message);
    }
  }

  const switchTo = isSignUp ? "/login" : "/signup";

  return (
    <PageLayout centerHeader>
      <div className={styles.centered}>
        <Card className={styles.card}>
          <h1 className={styles.title}>{isSignUp ? "Create account" : "Sign in"}</h1>
          <form onSubmit={handleSubmit} className={styles.form}>
            {isSignUp && <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? (isSignUp ? "Creating account…" : "Signing in…") : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
          <div className={styles.divider}>or</div>
          <Button variant="secondary" className={styles.googleButton} onClick={handleGoogleSignIn} icon={<IconBrandGoogleFilled />}>
            {isSignUp ? "Sign up with Google" : "Sign in with Google"}
          </Button>
          <p className={styles.modeSwitch}>
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link to={switchTo} search={{ email: email || undefined }} viewTransition={false} className={styles.modeSwitchLink}>
              {isSignUp ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </Card>
        <p className={styles.footer}>
          Made by{" "}
          <a href="https://legiec.io" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            @bibixx
          </a>
        </p>
      </div>
    </PageLayout>
  );
}
