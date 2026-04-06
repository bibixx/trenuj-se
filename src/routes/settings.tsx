import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { Badge } from "../components/primitives/Badge/Badge.tsx";
import { Button } from "../components/primitives/Button/Button.tsx";
import { ScrollAreaComponent as ScrollArea } from "../components/primitives/ScrollArea/ScrollArea.tsx";
import { Card } from "../components/primitives/Card/Card.tsx";
import { Dialog } from "../components/primitives/Dialog/Dialog.tsx";
import { Input } from "../components/primitives/Input/Input.tsx";
import { ToggleGroup } from "../components/primitives/ToggleGroup/ToggleGroup.tsx";
import { apiFetch } from "../lib/api.ts";
import { useTheme } from "../lib/theme.ts";
import type { ThemePreference } from "../lib/theme.ts";
import { useAuth } from "../lib/auth.ts";
import { tokensQueryOptions, useCreateToken, useRevokeToken } from "../lib/queries/api-tokens.ts";
import { profileKeys, profileQueryOptions } from "../lib/queries/profile.ts";
import { queryClient } from "../lib/query-client.ts";
import { supabase } from "../lib/supabase.ts";
import type { ApiToken, Profile } from "../lib/types.ts";
import styles from "./settings.module.css";

interface SettingsSearch {
  strava?: string;
  message?: string;
}

export const Route = createFileRoute("/settings")({
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

  const { data: tokens = [] } = useQuery({
    ...tokensQueryOptions,
    enabled: !!user,
  });

  return (
    <ScrollArea.Root className={styles.scroll}>
      <ScrollArea.Viewport fadeout={{ sizeTop: 32, sizeBottom: 40 }}>
        <ScrollArea.Content className={styles.root}>
          <header className={styles.header}>
            <Link to="/" className={styles.backLink} title="Back to plan">
              <IconArrowLeft size={18} />
            </Link>
            <h1 className={styles.heading}>Settings</h1>
          </header>

          <div className={styles.grid}>
            <AppearanceCard />
            <PasswordCard />
            <StravaCard profile={profile ?? null} stravaParam={stravaParam} />
            <TokensCard tokens={tokens} />
          </div>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar />
    </ScrollArea.Root>
  );
}

// --- Appearance Card ---

function AppearanceCard() {
  const [preference, , setTheme] = useTheme();

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderInfo}>
          <span className={styles.cardMeta}>Appearance</span>
          <h2 className={styles.cardTitle}>Theme</h2>
        </div>
      </div>
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

// --- Password Card ---

function PasswordCard() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderInfo}>
          <span className={styles.cardMeta}>Password</span>
          <h2 className={styles.cardTitle}>Change password</h2>
        </div>
      </div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>Password updated</p>}
        <div className={styles.buttonRow}>
          <Button type="submit" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Strava Card ---

function StravaCard({ profile, stravaParam }: { profile: Profile | null; stravaParam?: string }) {
  const isConnected = !!profile?.stravaAthleteId;
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(() => {
    if (stravaParam === "connected") return "Strava connected successfully";
    if (stravaParam === "error") return "Failed to connect Strava";
    return null;
  });

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      await apiFetch("/api/strava/sync", { method: "POST", body: JSON.stringify({}) });
      setFeedback("Sync complete");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

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

  const handleConnect = () => {
    window.location.href = `/api/strava/auth?callback=${encodeURIComponent("/settings?strava=connected")}`;
  };

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderInfo}>
          <span className={styles.cardMeta}>Strava</span>
          <h2 className={styles.cardTitle}>Connection</h2>
        </div>
        {isConnected && <Badge variant="status">Connected · Athlete #{profile.stravaAthleteId}</Badge>}
      </div>
      <p className={styles.cardDescription}>Strava stays optional, but when connected it powers the lightweight activity links back from the plan.</p>
      <div className={styles.buttonRow}>
        {isConnected ? (
          <>
            <Button variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        ) : (
          <button className={styles.stravaButton} onClick={handleConnect}>
            Connect with Strava
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
    </Card>
  );
}

// --- Tokens Card ---

function TokensCard({ tokens }: { tokens: ApiToken[] }) {
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);

  // Create token dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");

  // Revoke confirm dialog
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) return;
    try {
      const result = await createToken.mutateAsync(tokenName.trim());
      setNewTokenValue(result.token);
      setCreateOpen(false);
      setTokenName("");
    } catch {
      // mutation error handled by TanStack Query
    }
  };

  const handleRevoke = () => {
    if (!revokeTarget) return;
    revokeToken.mutate(revokeTarget.id);
    setRevokeTarget(null);
  };

  const handleCopyToken = () => {
    if (newTokenValue) {
      navigator.clipboard.writeText(newTokenValue);
    }
  };

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderInfo}>
          <span className={styles.cardMeta}>API tokens</span>
          <h2 className={styles.cardTitle}>MCP access</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)} disabled={createToken.isPending}>
          Create token
        </Button>
      </div>

      {newTokenValue && (
        <div className={styles.newToken}>
          <p className={styles.newTokenLabel}>Copy this token now — it won't be shown again:</p>
          <div className={styles.newTokenRow}>
            <code className={styles.newTokenValue}>{newTokenValue}</code>
            <Button variant="secondary" size="sm" onClick={handleCopyToken}>
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setNewTokenValue(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className={styles.emptyText}>No tokens yet</p>
      ) : (
        <div className={styles.tokenList}>
          {tokens.map((token) => (
            <div key={token.id} className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{token.name}</div>
                <div className={styles.tokenMeta}>
                  Created {formatDate(token.createdAt)}
                  {token.lastUsedAt ? ` · Last used ${formatDate(token.lastUsedAt)}` : " · Never used"}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setRevokeTarget(token)} disabled={revokeToken.isPending}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create token dialog */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Create API token</Dialog.Title>
          <Dialog.Description>Give your token a name so you can identify it later.</Dialog.Description>
          <form onSubmit={handleCreate} className={styles.dialogForm}>
            <Input label="Token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="e.g. Claude Desktop" autoFocus />
            <div className={styles.dialogActions}>
              <Button variant="ghost" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!tokenName.trim() || createToken.isPending}>
                {createToken.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      {/* Revoke confirm dialog */}
      <Dialog.Root open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Revoke token</Dialog.Title>
          <Dialog.Description>
            Revoke <strong>{revokeTarget?.name}</strong>? Any MCP client using this token will lose access immediately. This cannot be undone.
          </Dialog.Description>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              Revoke
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </Card>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
