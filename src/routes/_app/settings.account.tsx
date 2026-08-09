import clsx from "clsx";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "../../components/primitives/Button/Button.tsx";
import { Card } from "../../components/primitives/Card/Card.tsx";
import { Input } from "../../components/primitives/Input/Input.tsx";
import { ToggleGroup } from "../../components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useTheme } from "../../lib/theme.ts";
import type { ThemePreference } from "../../lib/theme.ts";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "../../lib/auth.ts";
import { supabase } from "../../lib/supabase.ts";
import styles from "./settings.module.css";

export const Route = createFileRoute("/_app/settings/account")({
  component: SettingsAccountPage,
});

function SettingsAccountPage() {
  const { user } = useAuth();

  return (
    <div className={styles.tabPanel}>
      <AccountSection user={user} />
      <AppearanceSection />
    </div>
  );
}

// --- Account Section ---

function AccountSection({ user }: { user: User | null }) {
  const meta = user?.user_metadata ?? {};
  const isEmailProvider = user?.app_metadata.provider === "email";

  const [name, setName] = useState(meta.full_name ?? meta.name ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: name },
      });
      if (updateError) throw updateError;
      setSuccess("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess("Password updated");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update password");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Card as="section" className={styles.sectionCard}>
      <h2 className={styles.sectionTitle}>Profile</h2>

      <form onSubmit={handleProfileSubmit} className={styles.form}>
        <Input label="Email address" value={user?.email ?? ""} readOnly />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <div className={styles.buttonRow}>
          <Button type="submit" loading={loading}>
            Save
          </Button>
        </div>
      </form>

      {isEmailProvider && (
        <form onSubmit={handlePasswordSubmit} className={clsx(styles.form, styles.dividedGroup)}>
          <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <div className={styles.buttonRow}>
            <Button type="submit" loading={loading}>
              Update password
            </Button>
          </div>
        </form>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}

      <div className={clsx(styles.buttonRow, styles.dividedGroup)}>
        <Button variant="destructive" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}

// --- Appearance Section ---

function AppearanceSection() {
  const [preference, , setTheme] = useTheme();

  return (
    <Card as="section" className={styles.sectionCard}>
      <h2 className={styles.sectionTitle}>Theme</h2>
      <div className={styles.buttonRow}>
        <ToggleGroup.Root value={[preference]} onValueChange={(v) => v.length > 0 && setTheme(v[0] as ThemePreference)} aria-label="Theme">
          <ToggleGroup.Item value="system">System</ToggleGroup.Item>
          <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
          <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
    </Card>
  );
}
