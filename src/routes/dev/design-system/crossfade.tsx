import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { WorkoutCard } from "../../../components/composites/WorkoutCard/WorkoutCard.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import { SAMPLE_WORKOUTS } from "./-sample-data.ts";
import styles from "./crossfade.module.css";
import dsStyles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/crossfade")({
  component: CrossfadePlayground,
});

// Fake per-week data so there's a visible content change
const WEEKS = [
  { label: "W1", workouts: SAMPLE_WORKOUTS.slice(0, 2) },
  { label: "W2", workouts: SAMPLE_WORKOUTS.slice(1, 3) },
  { label: "W3", workouts: SAMPLE_WORKOUTS.slice(2, 4) },
  { label: "W4", workouts: SAMPLE_WORKOUTS.slice(0, 3) },
];

type Phase = "idle" | "fading-out" | "fading-in";

function CrossfadePlayground() {
  const [currentWeek, setCurrentWeek] = useState(0);
  const [pendingWeek, setPendingWeek] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  const handleWeekChange = useCallback(
    (next: number) => {
      if (next === currentWeek || phase !== "idle") return;
      if (containerRef.current) {
        setContainerHeight(containerRef.current.offsetHeight);
      }
      setPendingWeek(next);
      setPhase("fading-out");
    },
    [currentWeek, phase],
  );

  const handleFadeOutEnd = useCallback(() => {
    if (pendingWeek !== null) {
      setCurrentWeek(pendingWeek);
      setPendingWeek(null);
    }
    setPhase("fading-in");
  }, [pendingWeek]);

  const handleFadeInEnd = useCallback(() => {
    setPhase("idle");
    setContainerHeight(undefined);
  }, []);

  const weekData = WEEKS[currentWeek]!;

  const contentClass = phase === "fading-out" ? styles.fadeOut : phase === "fading-in" ? styles.fadeIn : undefined;

  return (
    <div className={dsStyles.section}>
      <h1 className={dsStyles.sectionTitle}>Crossfade Transition</h1>
      <p className={dsStyles.description}>Click a week to see the fade-out → fade-in effect on the session list.</p>

      <div className={dsStyles.row}>
        {WEEKS.map((w, i) => (
          <button key={i} className={`${styles.pill} ${i === currentWeek ? styles.pillActive : ""}`} onClick={() => handleWeekChange(i)}>
            {w.label}
          </button>
        ))}
      </div>

      <div className={styles.crossfadeContainer} ref={containerRef} style={containerHeight != null ? { minHeight: containerHeight } : undefined}>
        <div key={currentWeek} className={contentClass} onAnimationEnd={phase === "fading-out" ? handleFadeOutEnd : phase === "fading-in" ? handleFadeInEnd : undefined}>
          <WeekContent workouts={weekData.workouts} />
        </div>
      </div>
    </div>
  );
}

function WeekContent({ workouts }: { workouts: typeof SAMPLE_WORKOUTS }) {
  return (
    <div className={styles.cardStack}>
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} workout={workout} dateLabel={workout.dateLabel} isToday={false} renderDescription={(desc) => <Markdown>{desc}</Markdown>} />
      ))}
    </div>
  );
}
