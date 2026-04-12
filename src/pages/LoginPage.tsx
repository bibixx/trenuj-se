import { IconBrandGoogleFilled } from "@tabler/icons-react";
import { type FormEvent, useCallback, useState, useSyncExternalStore } from "react";
import { Button } from "../components/primitives/Button/Button.tsx";
import { Card } from "../components/primitives/Card/Card.tsx";
import { Input } from "../components/primitives/Input/Input.tsx";
import { supabase } from "../lib/supabase.ts";
import styles from "./LoginPage.module.css";

function usePathname() {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      window.addEventListener("popstate", cb);
      return () => window.removeEventListener("popstate", cb);
    }, []),
    () => window.location.pathname,
  );
}

export function LoginPage() {
  const pathname = usePathname();
  const isSignUp = pathname === "/signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode() {
    setError(null);
    history.pushState(null, "", isSignUp ? "/login" : "/signup");
    // Trigger useSyncExternalStore update
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

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
      if (authError) setError(authError.message);
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
    }

    setLoading(false);
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
          <button type="button" className={styles.modeSwitchButton} onClick={switchMode}>
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </Card>
    </div>
  );
}
