import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "../../components/primitives/Button/Button.tsx";
import { Card } from "../../components/primitives/Card/Card.tsx";
import { PageLayout } from "../../components/composites/PageLayout/PageLayout.tsx";
import { ResetPasswordConfirmForm } from "../../components/composites/AuthForm/ResetPasswordConfirmForm.tsx";
import { parseRecoveryError } from "../../lib/password-reset.ts";
import { useAuth } from "../../lib/auth.ts";
import styles from "../../components/composites/AuthForm/AuthForm.module.css";

export const Route = createFileRoute("/_app/reset-password_/confirm")({
  component: ResetPasswordConfirmPage,
});

function ResetPasswordConfirmPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  // The recovery link signs the user in; no session after loading settles means
  // the link was expired, already used, or invalid.
  const recoveryError = parseRecoveryError(window.location.search, window.location.hash);
  if (recoveryError || !user) {
    return <RecoveryLinkError />;
  }

  return <ResetPasswordConfirmForm />;
}

function RecoveryLinkError() {
  return (
    <PageLayout centerHeader>
      <div className={styles.centered}>
        <Card className={styles.card}>
          <h1 className={styles.title}>Link expired</h1>
          <div className={styles.confirmText}>
            <p>This password reset link is invalid or has expired. Reset links can only be used once.</p>
          </div>
          <Button nativeButton={false} render={<Link to="/reset-password" />}>
            Request a new link
          </Button>
        </Card>
      </div>
    </PageLayout>
  );
}
