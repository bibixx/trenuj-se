import clsx from "clsx";
import { IconCheck, IconCopy, IconHistory } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState, useCallback, type ReactNode } from "react";
import { Card } from "../../primitives/Card/Card.tsx";
import { Badge } from "../../primitives/Badge/Badge.tsx";
import { Button } from "../../primitives/Button/Button.tsx";
import { TextLink } from "../../primitives/TextLink/TextLink.tsx";
import { ToggleGroup } from "../../primitives/ToggleGroup/ToggleGroup.tsx";
import { ScrollAreaComponent as ScrollArea } from "../../primitives/ScrollArea/ScrollArea.tsx";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import { McpClientInstructions } from "../McpClientInstructions/McpClientInstructions.tsx";
import { StravaConnectButton } from "../StravaConnectButton/StravaConnectButton.tsx";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard.ts";
import type { Profile } from "../../../lib/types.ts";
import createPlanPrompt from "./create-plan-prompt.md?raw";
import migratePlanPrompt from "./migrate-plan-prompt.md?raw";
import styles from "./EmptyPlanState.module.css";

type Tab = "create" | "migrate";

const TABS: { value: Tab; label: string }[] = [
  { value: "create", label: "Help me create a plan" },
  { value: "migrate", label: "I already have a plan" },
];

const DESCRIPTIONS: Record<Tab, string> = {
  create: "Copy this prompt into your favourite AI client to build a personalised training plan.",
  migrate: "Already have a plan elsewhere? Copy this prompt to migrate it into trenuj.se.",
};

interface StepProps {
  number: number;
  title: string;
  badge?: ReactNode;
  done?: boolean;
  children: ReactNode;
}

function Step({ number, title, badge, done, children }: StepProps) {
  return (
    <li className={styles.step}>
      <div className={clsx(styles.stepMarker, done && styles.stepMarkerDone)} aria-hidden>
        {done ? <IconCheck size={14} /> : number}
      </div>
      <div className={styles.stepBody}>
        <h3 className={styles.stepTitle}>
          {title}
          {badge}
        </h3>
        {children}
      </div>
    </li>
  );
}

interface EmptyPlanStateProps {
  className?: string;
  profile: Profile | null;
  onPastPlansClick?: () => void;
}

export function EmptyPlanState({ className, profile, onPastPlansClick }: EmptyPlanStateProps) {
  const [tab, setTab] = useState<Tab>("create");
  const copy = useCopyToClipboard();

  const stravaConnected = !!profile?.stravaAthleteId;
  const rawPrompt = tab === "create" ? createPlanPrompt : migratePlanPrompt;
  const prompt = rawPrompt.replaceAll("{SERVER_URL}", window.location.origin);

  const handleTabChange = useCallback((value: string[]) => {
    const next = value[value.length - 1] as Tab | undefined;
    if (next) setTab(next);
  }, []);

  return (
    <div className={clsx(styles.root, className)}>
      <Card className={styles.card}>
        <div className={styles.headerRow}>
          <h2 className={styles.heading}>No active plan yet</h2>
          {onPastPlansClick && (
            <Button variant="ghost" size="sm" onClick={onPastPlansClick}>
              <IconHistory size={14} />
              View past plans
            </Button>
          )}
        </div>

        <p className={styles.intro}>Plans on trenuj.se are built by an AI agent, not by hand. Set yours up in three steps.</p>

        <ol className={styles.steps}>
          <Step number={1} title="Connect an AI agent">
            <p className={styles.stepDescription}>Your agent needs a connection to trenuj.se before it can create plans. Pick your client and follow the steps.</p>
            <McpClientInstructions />
          </Step>

          <Step
            number={2}
            title="Connect Strava"
            done={stravaConnected}
            badge={stravaConnected ? <Badge variant="status">Connected</Badge> : <Badge variant="optional">Optional</Badge>}
          >
            <p className={styles.stepDescription}>Match your runs, rides, and swims to the workouts in your plan, and give your agent real training data to work from.</p>
            {stravaConnected ? (
              <p className={styles.stepDescription}>
                New activities will match to your workouts automatically. Manage in{" "}
                <TextLink variant="accent" render={<Link to="/settings/strava" />}>
                  Settings
                </TextLink>
                .
              </p>
            ) : (
              <>
                <div>
                  <StravaConnectButton callback="/" />
                </div>
                <p className={styles.stepNote}>Activities from before you connect aren't imported.</p>
              </>
            )}
          </Step>

          <Step number={3} title="Copy the plan prompt">
            <ToggleGroup.Root value={[tab]} onValueChange={handleTabChange} className={styles.toggleGroup} aria-label="Getting started">
              {TABS.map((t) => (
                <ToggleGroup.Item key={t.value} value={t.value} className={styles.toggleItem}>
                  {t.label}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>

            <div className={styles.tabContent} key={tab}>
              <p className={styles.stepDescription}>{DESCRIPTIONS[tab]}</p>

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
                  <Button variant="primary" size="sm" onClick={() => copy(prompt)}>
                    <IconCopy size={14} />
                    Copy prompt
                  </Button>
                </div>
              </div>
            </div>
          </Step>
        </ol>
      </Card>
    </div>
  );
}
