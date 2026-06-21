import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkoutCard } from "../../../components/composites/WorkoutCard/WorkoutCard.tsx";
import { WeekNavigation } from "../../../components/composites/WeekNavigation/WeekNavigation.tsx";
import { WeekSummary } from "../../../components/composites/WeekSummary/WeekSummary.tsx";
import { PlanNote } from "../../../components/composites/PlanNote/PlanNote.tsx";
import { GlobalLoadingBar } from "../../../components/composites/GlobalLoadingBar/GlobalLoadingBar.tsx";
import { Badge } from "../../../components/primitives/Badge/Badge.tsx";
import { Checkbox } from "../../../components/primitives/Checkbox/Checkbox.tsx";
import { DialogList } from "../../../components/primitives/DialogList/DialogList.tsx";
import { WorkoutTypeIcon } from "../../../components/domain/WorkoutTypeIcon/WorkoutTypeIcon.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import { SAMPLE_WORKOUTS, SAMPLE_NOTE } from "./-sample-data.ts";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/composites")({
  component: CompositesSection,
});

function CompositesSection() {
  const [selectedWeek, setSelectedWeek] = useState(8);
  const [barVisible, setBarVisible] = useState(true);

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Key Composites</h1>

      <h2 className={styles.subTitle}>Global Loading Bar</h2>
      <p className={styles.description}>Indeterminate bar shown while stale data revalidates. Pinned to the top of whatever surface it's mounted in — here, a stand-in screen.</p>
      <label className={styles.checkLabel}>
        <Checkbox checked={barVisible} onCheckedChange={(v) => setBarVisible(!!v)} />
        Visible
      </label>
      <div className={styles.loadingBarScreen}>
        <GlobalLoadingBar visible={barVisible} />
      </div>

      <h2 className={styles.subTitle}>Week Navigation</h2>
      <WeekNavigation totalWeeks={20} selectedWeek={selectedWeek} currentWeek={8} onWeekChange={setSelectedWeek} />

      <h2 className={styles.subTitle}>Week Summary</h2>
      <WeekSummary.Root>
        <WeekSummary.Header>
          <Badge variant="phase" hue={30}>
            PEAK
          </Badge>
          <WeekSummary.DateRange>Apr 6 – Apr 12, 2026</WeekSummary.DateRange>
        </WeekSummary.Header>
        <WeekSummary.Label>Week 8 — Race-simulation week</WeekSummary.Label>
        <WeekSummary.Stats>
          <WeekSummary.Progress value={28} />
          <WeekSummary.Volume>~9h</WeekSummary.Volume>
        </WeekSummary.Stats>
      </WeekSummary.Root>

      <h2 className={styles.subTitle}>Plan Note</h2>
      <PlanNote note={SAMPLE_NOTE} renderContent={(content) => <Markdown>{content}</Markdown>} />

      <h2 className={styles.subTitle}>Workout Cards</h2>
      <div className={styles.cardStack}>
        {SAMPLE_WORKOUTS.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            dateLabel={workout.dateLabel}
            isToday={workout.id === "w1"}
            defaultExpanded={workout.id === "w1" || workout.id === "w7"}
            renderDescription={(desc) => <Markdown>{desc}</Markdown>}
          />
        ))}
      </div>

      <h2 className={styles.subTitle}>Dialog List</h2>
      <p className={styles.description}>
        Selectable list designed to sit inside a <code>Dialog</code>. Items use a negative horizontal margin so hover backgrounds bleed past the dialog's content edges.
      </p>
      <div className={styles.dialogDemoStack}>
        <div className={styles.dialogDemoFrame}>
          <h3 className={styles.dialogDemoTitle}>Plans</h3>
          <DialogList.Root>
            {SAMPLE_DIALOG_LIST_ITEMS.map((item) => (
              <DialogList.Item key={item.id} active={item.active} disabled={item.disabled}>
                {item.icon && <WorkoutTypeIcon icon={item.icon} />}
                <DialogList.Content>
                  <DialogList.Name>{item.name}</DialogList.Name>
                  <DialogList.Meta>{item.meta}</DialogList.Meta>
                </DialogList.Content>
              </DialogList.Item>
            ))}
          </DialogList.Root>
        </div>

        <div className={styles.dialogDemoFrame}>
          <h3 className={styles.dialogDemoTitle}>No items</h3>
          <DialogList.Empty>No recent unlinked Strava activities. New activities sync automatically when you finish them.</DialogList.Empty>
        </div>

        <div className={styles.dialogDemoFrame}>
          <h3 className={styles.dialogDemoTitle}>Standalone item</h3>
          <p className={styles.description}>
            <code>DialogList.Item</code> works outside a <code>Root</code> too — used for one-off CTAs like "Connect with Strava".
          </p>
          <DialogList.Item>
            <DialogList.Content>
              <DialogList.Name>Connect with Strava</DialogList.Name>
            </DialogList.Content>
          </DialogList.Item>
        </div>
      </div>
    </div>
  );
}

const SAMPLE_DIALOG_LIST_ITEMS = [
  {
    id: "plan-1",
    name: "Marathon block — Spring 2026",
    meta: "Mar 1 – Apr 26, 2026",
    active: true,
  },
  {
    id: "plan-2",
    name: "Easy 8 km",
    meta: "Sat, Apr 12 · 48 min · 8 km",
    icon: "run",
  },
  {
    id: "plan-3",
    name: "Threshold ride",
    meta: "Currently linking…",
    icon: "bike",
    disabled: true,
  },
  {
    id: "plan-4",
    name: "An unusually long workout name that should truncate cleanly with an ellipsis",
    meta: "Tue, Apr 15 · 1h 12m",
    icon: "swimming",
  },
] satisfies ReadonlyArray<{
  id: string;
  name: string;
  meta: string;
  active?: boolean;
  disabled?: boolean;
  icon?: string;
}>;
