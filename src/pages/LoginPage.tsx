import { type FormEvent, useState } from "react";
import { Button } from "../components/primitives/Button/Button.tsx";
import { Card } from "../components/primitives/Card/Card.tsx";
import { Input } from "../components/primitives/Input/Input.tsx";
import { supabase } from "../lib/supabase.ts";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    }
  }

  async function handleGoogleSignIn() {
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (authError) {
      setError(authError.message);
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className={styles.error}>{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className={styles.divider}>or</div>
        <Button variant="secondary" className={styles.googleButton} onClick={handleGoogleSignIn}>
          Sign in with Google
        </Button>
      </Card>
    </div>
  );
}
