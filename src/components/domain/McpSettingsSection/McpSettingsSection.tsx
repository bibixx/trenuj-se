import { Toast } from "@base-ui/react/toast";
import { IconCopy } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../primitives/Button/Button.tsx";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import { Input } from "../../primitives/Input/Input.tsx";
import { ToggleGroup } from "../../primitives/ToggleGroup/ToggleGroup.tsx";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import {
  type CreateConnectorTokenResult,
  type McpConnectorToken,
  mcpConnectorTokensQueryOptions,
  useCreateConnectorToken,
  useRevokeConnectorToken,
} from "../../../lib/queries/mcp-connector-tokens.ts";
import { hasFlag } from "../../../lib/types.ts";
import type { Profile } from "../../../lib/types.ts";
import claudeAiMd from "./instructions/claude-ai.md?raw";
import claudeCodeMd from "./instructions/claude-code.md?raw";
import cursorMd from "./instructions/cursor.md?raw";
import vscodeMd from "./instructions/vscode.md?raw";
import styles from "./McpSettingsSection.module.css";

type Tab = "claude-ai" | "claude-code" | "cursor" | "vscode";

const TABS: { value: Tab; label: string }[] = [
  { value: "claude-ai", label: "Claude" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
];

const TAB_CONTENT: Record<Tab, { md: string; copyLabel: string; copyValue: (serverUrl: string) => string }> = {
  "claude-ai": {
    md: claudeAiMd,
    copyLabel: "Copy server URL",
    copyValue: (serverUrl) => `${serverUrl}/mcp`,
  },
  "claude-code": {
    md: claudeCodeMd,
    copyLabel: "Copy command",
    copyValue: (serverUrl) => `claude mcp add trenuj-se --transport streamable-http "${serverUrl}/mcp"`,
  },
  cursor: {
    md: cursorMd,
    copyLabel: "Copy config",
    copyValue: (serverUrl) => JSON.stringify({ mcpServers: { "trenuj-se": { url: `${serverUrl}/mcp` } } }, null, 2),
  },
  vscode: {
    md: vscodeMd,
    copyLabel: "Copy config",
    copyValue: (serverUrl) => JSON.stringify({ servers: { "trenuj-se": { type: "http", url: `${serverUrl}/mcp` } } }, null, 2),
  },
};

/** Eases the container between the differing natural heights of tab contents. */
function AnimatedHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.animatedHeight} style={{ height }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

function useCopyToClipboard() {
  const toastManager = Toast.useToastManager();
  return (value: string) => {
    navigator.clipboard.writeText(value);
    toastManager.add({ title: "Copied to clipboard", type: "success" });
  };
}

export function McpSettingsSection({ profile }: { profile: Profile | null }) {
  const tokensEnabled = hasFlag(profile, "mcp_connector_tokens");
  const [tab, setTab] = useState<Tab>("claude-ai");
  const copy = useCopyToClipboard();

  const serverUrl = window.location.origin;
  const { md, copyLabel, copyValue } = TAB_CONTENT[tab];

  const handleTabChange = (value: string[]) => {
    const next = value[value.length - 1] as Tab | undefined;
    if (next) setTab(next);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Connect an AI agent</h2>
      <p className={styles.sectionDescription}>Manage your plan from any MCP-capable AI client. Point it at the trenuj.se server and log in with your account when prompted.</p>

      <ToggleGroup.Root value={[tab]} onValueChange={handleTabChange} className={styles.toggleGroup} aria-label="MCP client">
        {TABS.map((t) => (
          <ToggleGroup.Item key={t.value} value={t.value} className={styles.toggleItem}>
            {t.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <AnimatedHeight>
        <div className={styles.tabContent} key={tab}>
          <div className={styles.instructions}>
            <Markdown>{md.replaceAll("{SERVER_URL}", serverUrl)}</Markdown>
          </div>
          <div className={styles.buttonRow}>
            <Button variant="primary" size="sm" onClick={() => copy(copyValue(serverUrl))}>
              <IconCopy size={14} />
              {copyLabel}
            </Button>
          </div>
          {tokensEnabled && (tab === "claude-ai" || tab === "claude-code") && (
            <p className={styles.hint}>Claude failing during the OAuth login? Create a connector token below and use its pre-authenticated URL instead.</p>
          )}
        </div>
      </AnimatedHeight>

      {tokensEnabled && <ConnectorTokensSubsection />}
    </section>
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
        <p className={styles.emptyText}>No connector tokens yet.</p>
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
                  <Button type="submit" disabled={createToken.isPending || name.trim().length === 0}>
                    {createToken.isPending ? "Creating…" : "Create"}
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
