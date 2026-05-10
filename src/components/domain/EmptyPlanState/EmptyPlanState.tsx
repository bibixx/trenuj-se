import clsx from "clsx";
import { Toast } from "@base-ui/react/toast";
import { IconCopy, IconHistory } from "@tabler/icons-react";
import { useState, useCallback } from "react";
import { Card } from "../../primitives/Card/Card.tsx";
import { Button } from "../../primitives/Button/Button.tsx";
import { ToggleGroup } from "../../primitives/ToggleGroup/ToggleGroup.tsx";
import { ScrollAreaComponent as ScrollArea } from "../../primitives/ScrollArea/ScrollArea.tsx";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import createPlanPrompt from "./create-plan-prompt.md?raw";
import migratePlanPrompt from "./migrate-plan-prompt.md?raw";
import styles from "./EmptyPlanState.module.css";

type Tab = "create" | "migrate";

const TABS: { value: Tab; label: string }[] = [
  { value: "create", label: "Help me create a plan" },
  { value: "migrate", label: "I already have a plan" },
];

const DESCRIPTIONS: Record<Tab, string> = {
  create: "Copy this prompt and paste it into your favourite AI client to get started building a personalized training plan.",
  migrate: "Already have a plan elsewhere? Copy this prompt to migrate it into trenuj.se.",
};

interface EmptyPlanStateProps {
  className?: string;
  onPastPlansClick?: () => void;
}

export function EmptyPlanState({ className, onPastPlansClick }: EmptyPlanStateProps) {
  const [tab, setTab] = useState<Tab>("create");
  const toastManager = Toast.useToastManager();

  const prompt = tab === "create" ? createPlanPrompt : migratePlanPrompt;

  const handleTabChange = useCallback((value: string[]) => {
    const next = value[value.length - 1] as Tab | undefined;
    if (next) setTab(next);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(prompt);
    toastManager.add({ title: "Copied to clipboard", type: "success" });
  }, [prompt, toastManager]);

  return (
    <div className={clsx(styles.root, className)}>
      <Card className={styles.card}>
        <h2 className={styles.heading}>No active plan yet</h2>

        {onPastPlansClick && (
          <Button variant="ghost" size="sm" onClick={onPastPlansClick}>
            <IconHistory size={14} />
            View past plans
          </Button>
        )}

        <ToggleGroup.Root value={[tab]} onValueChange={handleTabChange} className={styles.toggleGroup} aria-label="Getting started">
          {TABS.map((t) => (
            <ToggleGroup.Item key={t.value} value={t.value} className={styles.toggleItem}>
              {t.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>

        <div className={styles.tabContent} key={tab}>
          <p className={styles.description}>{DESCRIPTIONS[tab]}</p>

          <div className={styles.promptArea}>
            <ScrollArea.Root>
              <ScrollArea.Viewport fadeout={{ sizeTop: 0, sizeBottom: 40 }}>
                <ScrollArea.Content>
                  <div className={styles.promptText}>
                    <Markdown>{prompt}</Markdown>
                  </div>
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar />
            </ScrollArea.Root>

            <div className={styles.copyRow}>
              <Button variant="primary" size="sm" onClick={handleCopy}>
                <IconCopy size={14} />
                Copy prompt
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
