import { Toast } from "@base-ui/react/toast";
import { IconCopy } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { McpClientInstructions } from "../McpClientInstructions/McpClientInstructions.tsx";
import {
  type CreateConnectorTokenResult,
  type McpConnectorToken,
  mcpConnectorTokensQueryOptions,
  useCreateConnectorToken,
  useRevokeConnectorToken,
} from "../../../lib/queries/mcp-connector-tokens.ts";
import { type OAuthGrant, oauthGrantsQueryOptions, useRevokeOAuthGrant } from "../../../lib/queries/oauth-grants.ts";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard.ts";
import { hasFlag } from "../../../lib/types.ts";
import type { Profile } from "../../../lib/types.ts";
import styles from "./McpSettingsSection.module.css";

export function McpSettingsSection({ profile }: { profile: Profile | null }) {
  const tokensEnabled = hasFlag(profile, "mcp_connector_tokens");

  return (
    <Card as="section" className={styles.section}>
      <h2 className={styles.sectionTitle}>Connect an AI agent</h2>
      <p className={styles.sectionDescription}>Manage your plan from an AI client such as Claude or Cursor. Pick your client below and follow the steps.</p>

      <McpClientInstructions
        renderHint={(tab) =>
          tokensEnabled &&
          (tab === "claude-ai" || tab === "claude-code") && (
            <p className={styles.hint}>Claude failing during the OAuth login? Create a connector token below and use its pre-authenticated URL instead.</p>
          )
        }
      />

      <ConnectedAppsSubsection />

      {tokensEnabled && <ConnectorTokensSubsection />}
    </Card>
  );
}

// --- Connected applications (OAuth grants) ---

function ConnectedAppsSubsection() {
  const { data: grants } = useQuery(oauthGrantsQueryOptions);
  const revokeGrant = useRevokeOAuthGrant();
  const toastManager = Toast.useToastManager();
  const [revokeTarget, setRevokeTarget] = useState<OAuthGrant | null>(null);

  const handleRevoke = async () => {
    const target = revokeTarget;
    setRevokeTarget(null);
    if (!target) return;
    try {
      await revokeGrant.mutateAsync(target.client.id);
      toastManager.add({ title: `Access for “${target.client.name}” revoked`, type: "success" });
    } catch (err) {
      toastManager.add({ title: "Couldn't revoke access", description: err instanceof Error ? err.message : undefined, type: "error" });
    }
  };

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Connected applications</h3>
      <p className={styles.sectionDescription}>AI clients you've approved through the sign-in flow. Revoking access signs the client out immediately.</p>

      {grants && grants.length > 0 ? (
        <div className={styles.tokenList}>
          {grants.map((grant) => (
            <div key={grant.client.id} className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{grant.client.name}</div>
                <div className={styles.tokenMeta}>Connected {formatDate(grant.granted_at)}</div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setRevokeTarget(grant)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>No connected applications yet</p>
      )}

      <Dialog.Root open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Revoke access</Dialog.Title>
          <Dialog.Description>Revoke access for “{revokeTarget?.client.name}”? The client will be signed out and will need to be approved again to reconnect.</Dialog.Description>
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
    </div>
  );
}

// --- Connector tokens (flag-gated) ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ConnectorTokensSubsection() {
  const { data: tokens } = useQuery(mcpConnectorTokensQueryOptions);
  const createToken = useCreateConnectorToken();
  const revokeToken = useRevokeConnectorToken();
  const toastManager = Toast.useToastManager();
  const copy = useCopyToClipboard();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreateConnectorTokenResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<McpConnectorToken | null>(null);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setCreated(await createToken.mutateAsync(trimmed));
      setName("");
    } catch (err) {
      toastManager.add({ title: "Couldn't create token", description: err instanceof Error ? err.message : undefined, type: "error" });
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
      toastManager.add({ title: "Couldn't revoke token", description: err instanceof Error ? err.message : undefined, type: "error" });
    }
  };

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Connector tokens</h3>
      <p className={styles.sectionDescription}>
        A connector token gives a Claude client a pre-authenticated URL when the OAuth login fails. Anyone with the URL can access your training data — treat it like a password.
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
        <p className={styles.emptyText}>No connector tokens yet</p>
      )}

      <div className={styles.buttonRow}>
        <Button onClick={() => setCreateOpen(true)}>Create token</Button>
      </div>

      <Dialog.Root open={createOpen} onOpenChange={handleCreateOpenChange}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>{created ? "Token created" : "Create connector token"}</Dialog.Title>
          {created ? (
            <>
              <Dialog.Description>This URL is shown only once — store it now. Anyone with it can access your training data.</Dialog.Description>
              <div className={styles.dialogForm}>
                <div className={styles.newToken}>
                  <span className={styles.newTokenLabel}>Pre-authenticated URL</span>
                  <div className={styles.newTokenRow}>
                    <span className={styles.newTokenValue}>{created.connectorUrl}</span>
                    <Button variant="ghost" size="sm" onClick={() => copy(created.connectorUrl)} aria-label="Copy URL">
                      <IconCopy size={14} />
                    </Button>
                  </div>
                </div>
                <div className={styles.newToken}>
                  <span className={styles.newTokenLabel}>Claude Code command</span>
                  <div className={styles.newTokenRow}>
                    <span className={styles.newTokenValue}>{claudeCodeCommand(created.connectorUrl)}</span>
                    <Button variant="ghost" size="sm" onClick={() => copy(claudeCodeCommand(created.connectorUrl))} aria-label="Copy command">
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
              <Dialog.Description>Name the token after the client that will use it.</Dialog.Description>
              <form onSubmit={handleCreateSubmit} className={styles.dialogForm}>
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Desktop" maxLength={120} autoFocus />
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
          <Dialog.Description>Revoke “{revokeTarget?.name}”? Clients using its URL will stop working immediately. This cannot be undone.</Dialog.Description>
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
    </div>
  );
}

function claudeCodeCommand(connectorUrl: string): string {
  return `claude mcp add trenuj-se --transport streamable-http "${connectorUrl}"`;
}
