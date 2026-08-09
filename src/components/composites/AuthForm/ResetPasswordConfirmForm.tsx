import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { PageLayout } from "../PageLayout/PageLayout.tsx";
import { validateNewPassword } from "../../../lib/password-reset.ts";
import { supabase } from "../../../lib/supabase.ts";
import styles from "./AuthForm.module.css";

export function ResetPasswordConfirmForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Strip leftover recovery params so a reload doesn't re-process them.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      history.replaceState(null, "", "/reset-password/confirm");
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateNewPassword(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    void navigate({ to: "/", replace: true });
  }

  return (
    <PageLayout centerHeader>
      <div className={styles.centered}>
        <Card className={styles.card}>
          <h1 className={styles.title}>Choose a new password</h1>
          <form onSubmit={handleSubmit} className={styles.form}>
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              autoFocus
            />
            <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={pending}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}
