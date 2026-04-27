import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkoutCard } from "../../../components/composites/WorkoutCard/WorkoutCard.tsx";
import { WeekNavigation } from "../../../components/composites/WeekNavigation/WeekNavigation.tsx";
import { WeekSummary } from "../../../components/composites/WeekSummary/WeekSummary.tsx";
import { PlanNote } from "../../../components/composites/PlanNote/PlanNote.tsx";
import { Badge } from "../../../components/primitives/Badge/Badge.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import { SAMPLE_WORKOUTS, SAMPLE_NOTE } from "./-sample-data.ts";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/composites")({
  component: CompositesSection,
});

function CompositesSection() {
  const [selectedWeek, setSelectedWeek] = useState(8);

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Key Composites</h1>

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
            defaultExpanded={workout.id === "w1"}
            renderDescription={(desc) => <Markdown>{desc}</Markdown>}
          />
        ))}
      </div>
    </div>
  );
}
