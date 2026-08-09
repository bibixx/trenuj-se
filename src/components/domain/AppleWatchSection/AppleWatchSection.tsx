import { Toast } from "@base-ui/react/toast";
import { IconCopy } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { TextLink } from "../../primitives/TextLink/TextLink.tsx";
import { type CreateWatchTokenResult, type WatchToken, useCreateWatchToken, useRevokeWatchToken, watchTokensQueryOptions } from "../../../lib/queries/watch-tokens.ts";
import styles from "./AppleWatchSection.module.css";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function useCopyToClipboard() {
  const toastManager = Toast.useToastManager();
  return (value: string) => {
    navigator.clipboard.writeText(value);
    toastManager.add({ title: "Copied to clipboard", type: "success" });
  };
}

export function AppleWatchSection() {
  const { data: tokens } = useQuery(watchTokensQueryOptions);
  const createToken = useCreateWatchToken();
  const revokeToken = useRevokeWatchToken();
  const toastManager = Toast.useToastManager();
  const copy = useCopyToClipboard();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreateWatchTokenResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<WatchToken | null>(null);

  const rootUrl = `${window.location.origin}/api/watch/index.json`;

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setCreated(await createToken.mutateAsync(trimmed));
      setName("");
    } catch (err) {
      toastManager.add({ title: "Couldn't create watch token", description: err instanceof Error ? err.message : undefined, type: "error" });
    }
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreated(null);
      setName("");
    }
  };

  const handleRevoke = async () => {
    const target = revokeTarget;
    setRevokeTarget(null);
    if (!target) return;
    try {
      await revokeToken.mutateAsync(target.id);
      toastManager.add({ title: `Token “${target.name}” revoked`, type: "success" });
    } catch (err) {
      toastManager.add({ title: "Couldn't revoke watch token", description: err instanceof Error ? err.message : undefined, type: "error" });
    }
  };

  return (
    <Card as="section" className={styles.section}>
      <h2 className={styles.sectionTitle}>Apple Watch</h2>
      <p className={styles.sectionDescription}>
        Sync your planned workouts to your Apple Watch via the{" "}
        <TextLink variant="accent" href="https://github.com/bibixx/workout-feed#installing-via-sidestore" target="_blank" rel="noreferrer">
          Workout Feed
        </TextLink>{" "}
        app. Create a token, then paste the Root URL and Authorization values into the app. You can revoke tokens here at any time.
      </p>

      {tokens && tokens.length > 0 ? (
        <div className={styles.tokenList}>
          {tokens.map((token) => (
            <div key={token.id} className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{token.name}</div>
                <div className={styles.tokenMeta}>
                  Created {formatDate(token.createdAt)} · {token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : "Never used"}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setRevokeTarget(token)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>No watch tokens yet</p>
      )}

      <div className={styles.buttonRow}>
        <Button onClick={() => setCreateOpen(true)}>Create token</Button>
      </div>

      <Dialog.Root open={createOpen} onOpenChange={handleCreateOpenChange}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>{created ? "Token created" : "Create watch token"}</Dialog.Title>
          {created ? (
            <>
              <Dialog.Description>
                The Authorization value is shown only once — paste it into the Workout Feed app now. Anyone with it can read your planned workouts.
              </Dialog.Description>
              <div className={styles.dialogForm}>
                <div className={styles.newToken}>
                  <span className={styles.newTokenLabel}>Root URL</span>
                  <div className={styles.newTokenRow}>
                    <span className={styles.newTokenValue}>{rootUrl}</span>
                    <Button variant="ghost" size="sm" onClick={() => copy(rootUrl)} aria-label="Copy Root URL">
                      <IconCopy size={14} />
                    </Button>
                  </div>
                </div>
                <div className={styles.newToken}>
                  <span className={styles.newTokenLabel}>Authorization</span>
                  <div className={styles.newTokenRow}>
                    <span className={styles.newTokenValue}>Bearer {created.rawToken}</span>
                    <Button variant="ghost" size="sm" onClick={() => copy(`Bearer ${created.rawToken}`)} aria-label="Copy Authorization">
                      <IconCopy size={14} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className={styles.dialogActions}>
                <Button onClick={() => handleCreateOpenChange(false)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <Dialog.Description>Name the token after the device that will use it.</Dialog.Description>
              <form onSubmit={handleCreateSubmit} className={styles.dialogForm}>
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bartek's Apple Watch" maxLength={120} autoFocus />
                <div className={styles.dialogActions}>
                  <Button type="button" variant="ghost" onClick={() => handleCreateOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={createToken.isPending} disabled={name.trim().length === 0}>
                    Create
                  </Button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Revoke token</Dialog.Title>
          <Dialog.Description>Revoke “{revokeTarget?.name}”? Devices using it will stop syncing immediately. This cannot be undone.</Dialog.Description>
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
