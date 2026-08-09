import clsx from "clsx";
import { IconCopy } from "@tabler/icons-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../primitives/Button/Button.tsx";
import { ToggleGroup } from "../../primitives/ToggleGroup/ToggleGroup.tsx";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard.ts";
import claudeAiMd from "./instructions/claude-ai.md?raw";
import claudeCodeMd from "./instructions/claude-code.md?raw";
import cursorMd from "./instructions/cursor.md?raw";
import vscodeMd from "./instructions/vscode.md?raw";
import styles from "./McpClientInstructions.module.css";

export type McpClientTab = "claude-ai" | "claude-code" | "cursor" | "vscode";

const TABS: { value: McpClientTab; label: string }[] = [
  { value: "claude-ai", label: "Claude" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
];

const TAB_CONTENT: Record<McpClientTab, { md: string; copyLabel: string; copyValue: (serverUrl: string) => string }> = {
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

/**
 * Eases the container between the differing natural heights of tab contents.
 * Overflow is clipped only while the height transition runs — a permanent clip
 * would shave the copy button's hover scale when it's the last child.
 */
function AnimatedHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number>(undefined);
  const [height, setHeight] = useState<number>();
  const [animating, setAnimating] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const next = el.offsetHeight;
      if (lastHeightRef.current !== undefined && lastHeightRef.current !== next) {
        setAnimating(true);
      }
      lastHeightRef.current = next;
      setHeight(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={clsx(styles.animatedHeight, animating && styles.animating)}
      style={{ height }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "height") setAnimating(false);
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

interface McpClientInstructionsProps {
  className?: string;
  /** Rendered under the copy button for the active tab (Settings uses this for the connector-token hint). */
  renderHint?: (tab: McpClientTab) => ReactNode;
}

/** Per-client MCP setup instructions with a tab per AI client and a copy button. */
export function McpClientInstructions({ className, renderHint }: McpClientInstructionsProps) {
  const [tab, setTab] = useState<McpClientTab>("claude-ai");
  const copy = useCopyToClipboard();

  const serverUrl = window.location.origin;
  const { md, copyLabel, copyValue } = TAB_CONTENT[tab];

  const handleTabChange = (value: string[]) => {
    const next = value[value.length - 1] as McpClientTab | undefined;
    if (next) setTab(next);
  };

  return (
    <div className={className}>
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
          {renderHint?.(tab)}
        </div>
      </AnimatedHeight>
    </div>
  );
}
