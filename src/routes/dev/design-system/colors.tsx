import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkoutCard } from "../../../components/composites/WorkoutCard/WorkoutCard.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/colors")({
  component: ColorsSection,
});

function ColorsSection() {
  const [hue, setHue] = useState(150);

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>OKLCH Color System</h1>
      <p className={styles.description}>All colors derived from a single hue value (0–359°). Drag the slider to see live updates.</p>

      <div className={styles.hueControl}>
        <label className={styles.hueLabel}>
          Hue: <code>{hue}°</code>
        </label>
        <input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className={styles.hueSlider} />
      </div>

      <div
        className={styles.colorDemo}
        style={
          {
            "--hue": hue,
            "--session-tint-preview": `oklch(var(--workout-tint-lightness) var(--workout-tint-chroma) ${hue})`,
            "--session-accent-preview": `oklch(var(--workout-accent-lightness) var(--workout-accent-chroma) ${hue})`,
          } as React.CSSProperties
        }
      >
        <div className={styles.colorRow}>
          <div className={styles.colorSample} style={{ background: "var(--session-tint-preview)" }}>
            <span>--session-tint</span>
            <code>{"oklch(var(--workout-tint-lightness) var(--workout-tint-chroma) {hue})"}</code>
          </div>
          <div className={styles.colorSample} style={{ background: "var(--session-accent-preview)" }}>
            <span>--session-accent</span>
            <code>{"oklch(var(--workout-accent-lightness) var(--workout-accent-chroma) {hue})"}</code>
          </div>
          <div className={styles.colorSample} style={{ color: "var(--session-accent-preview)", background: "var(--bg)" }}>
            <span style={{ color: "var(--session-accent-preview)" }}>Completed title</span>
            <code>color: var(--session-accent)</code>
          </div>
          <div className={styles.colorSample} style={{ outline: `2px solid var(--session-accent-preview)`, background: "var(--bg)" }}>
            <span>Today outline</span>
            <code>box-shadow: 0 0 0 1px var(--session-accent)</code>
          </div>
        </div>

        <h3 className={styles.subTitle}>Live Workout Card Preview</h3>
        <WorkoutCard
          workout={{
            id: "color-demo",
            planId: "plan-1",
            phaseId: null,
            date: "2026-04-06",
            labelId: "demo-label",
            label: { id: "demo-label", key: "demo", label: "Demo", hue, icon: "run", metadata: null, activitySports: ["Run"], createdAt: "", updatedAt: "" },
            title: "Sample Workout at Hue " + hue + "°",
            description: "This workout card updates live as you drag the hue slider.\n\n**Zone targets:**\n- Z2: 30 min\n- Z3: 15 min\n- Z4: 10 min",
            targetDurationMin: 55,
            targetDistanceM: null,
            sortOrder: 0,
            status: "planned",
            completionNotes: null,
            trainerNotes: "Coach says: looking good, keep it up!",
            activityId: null,
            execution: null,
            metadata: null,
            createdAt: "",
            updatedAt: "",
          }}
          dateLabel="Mon"
          isToday
          defaultExpanded
          renderDescription={(desc) => <Markdown>{desc}</Markdown>}
        />
      </div>
    </div>
  );
}
