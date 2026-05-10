import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Badge } from "../../components/primitives/Badge/Badge.tsx";
import { Button } from "../../components/primitives/Button/Button.tsx";
import { Dialog } from "../../components/primitives/Dialog/Dialog.tsx";
import { Input } from "../../components/primitives/Input/Input.tsx";
import { ToggleGroup } from "../../components/primitives/ToggleGroup/ToggleGroup.tsx";
import { PageLayout } from "../../components/composites/PageLayout/PageLayout.tsx";
import { apiFetch } from "../../lib/api.ts";
import { useTheme } from "../../lib/theme.ts";
import type { ThemePreference } from "../../lib/theme.ts";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "../../lib/auth.ts";
import { profileKeys, profileQueryOptions } from "../../lib/queries/profile.ts";
import { queryClient } from "../../lib/query-client.ts";
import { supabase } from "../../lib/supabase.ts";
import type { Profile } from "../../lib/types.ts";
import styles from "./settings.module.css";

interface SettingsSearch {
  strava?: string;
  message?: string;
}

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    strava: (search.strava as string) ?? undefined,
    message: (search.message as string) ?? undefined,
  }),
});

function SettingsPage() {
  const { user } = useAuth();
  const { strava: stravaParam } = Route.useSearch();

  const { data: profile } = useQuery({
    ...profileQueryOptions,
    enabled: !!user,
  });

  return (
    <PageLayout>
      <h1 className={styles.heading}>Settings</h1>

      <div className={styles.grid}>
        <AccountSection user={user} />
        <AppearanceSection />
        <StravaSection profile={profile ?? null} stravaParam={stravaParam} />
      </div>
    </PageLayout>
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
      setError(err instanceof Error ? err.message : "Failed to update profile");
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
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Profile</h2>

      <form onSubmit={handleProfileSubmit} className={styles.form}>
        <Input label="Email address" value={user?.email ?? ""} readOnly />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <div className={styles.buttonRow}>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      {isEmailProvider && (
        <form onSubmit={handlePasswordSubmit} className={styles.form}>
          <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <div className={styles.buttonRow}>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}

      <div className={styles.buttonRow}>
        <Button variant="destructive" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </section>
  );
}

// --- Appearance Section ---

function AppearanceSection() {
  const [preference, , setTheme] = useTheme();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Theme</h2>
      <div className={styles.buttonRow}>
        <ToggleGroup.Root value={[preference]} onValueChange={(v) => v.length > 0 && setTheme(v[0] as ThemePreference)} aria-label="Theme">
          <ToggleGroup.Item value="system">System</ToggleGroup.Item>
          <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
          <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
    </section>
  );
}

// --- Strava Section ---

function StravaSection({ profile, stravaParam }: { profile: Profile | null; stravaParam?: string }) {
  const isConnected = !!profile?.stravaAthleteId;
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(() => {
    if (stravaParam === "connected") return "Strava connected successfully";
    if (stravaParam === "error") return "Failed to connect Strava";
    return null;
  });

  const handleDisconnect = async () => {
    setConfirmOpen(false);
    setDisconnecting(true);
    setFeedback(null);
    try {
      await apiFetch("/api/strava/disconnect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: profileKeys.current });
      setFeedback("Strava disconnected");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  };

  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch(`/api/strava/auth?callback=${encodeURIComponent("/settings?strava=connected")}`);
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to start Strava connection");
      setConnecting(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Strava Connection</h2>
        {isConnected && <Badge variant="status">Connected · Athlete #{profile.stravaAthleteId}</Badge>}
      </div>
      <p className={styles.sectionDescription}>
        Connect Strava to match your runs, rides, and swims to the workouts in your plan.
        <br />
        This will happen automatically and can be done using “Link Strava activity” button.
      </p>
      <div className={styles.buttonRow}>
        {isConnected ? (
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <button className={styles.stravaButton} onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect with Strava"}
          </button>
        )}
      </div>
      {feedback && <p className={styles.hint}>{feedback}</p>}

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Disconnect Strava</Dialog.Title>
          <Dialog.Description>Activity links will remain, but no new activities will sync. This can be reconnected later.</Dialog.Description>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </section>
  );
}
