import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkoutCard } from "../../../components/composites/WorkoutCard/WorkoutCard.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import { Input } from "../../../components/primitives/Input/Input.tsx";
import { Select } from "../../../components/primitives/Select/Select.tsx";
import { Checkbox } from "../../../components/primitives/Checkbox/Checkbox.tsx";
import { ToggleGroup } from "../../../components/primitives/ToggleGroup/ToggleGroup.tsx";
import { ScrollAreaComponent as ScrollArea } from "../../../components/primitives/ScrollArea/ScrollArea.tsx";
import type { Label, Workout, WorkoutActivity, WorkoutExecution, WorkoutMetadata } from "../../../lib/types.ts";
import dsStyles from "../design-system.module.css";
import styles from "./workout-card.module.css";

export const Route = createFileRoute("/dev/design-system/workout-card")({
  component: WorkoutCardSection,
});

type TypeOption = "standard" | "optional" | "rest" | "note";
type StatusOption = "planned" | "completed" | "skipped";

const TS = "2026-01-01T00:00:00Z";

const ICON_OPTIONS = [
  { value: "run", label: "run" },
  { value: "bike", label: "bike" },
  { value: "swimming", label: "swimming" },
  { value: "strength", label: "strength" },
  { value: "walk", label: "walk" },
  { value: "rest", label: "rest" },
  { value: "none", label: "none" },
];

const SAMPLE_ACTIVITY: WorkoutActivity = {
  stravaId: 18932748374,
  sport: "Run",
  name: "Morning Run",
  startDate: "2026-04-06T07:00:00Z",
  timezone: null,
  durationSec: 2700,
  distanceM: 8000,
  elevationM: 42,
  avgHr: 142,
  maxHr: 165,
  avgPower: null,
  calories: 410,
};

const SAMPLE_EXECUTION: WorkoutExecution = {
  version: 2,
  structure: [{ type: "steady", target: { type: "time", seconds: 2700 }, alert: { type: "heartRateZone", zone: 2 } }],
  appleWatch: { activityType: "running", location: "outdoor" },
};

const DEFAULT_DESCRIPTION =
  "Easy pace run to recover from the weekend. Keep heart rate in **Zone 2** throughout.\n\n### Execution\n- Warm up: 10 min walk/jog\n- Main: 30 min easy\n- Cool down: 5 min walk\n\n> Focus on nasal breathing and relaxed shoulders.";

function WorkoutCardSection() {
  const [title, setTitle] = useState("Easy Recovery Run");
  const [dateLabel, setDateLabel] = useState("Mon");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [trainerNotes, setTrainerNotes] = useState("Start easy, save energy for Thursday's intervals.");
  const [completionNotes, setCompletionNotes] = useState("");
  const [durationMin, setDurationMin] = useState<number | null>(45);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [type, setType] = useState<TypeOption>("standard");
  const [status, setStatus] = useState<StatusOption>("planned");
  const [icon, setIcon] = useState("run");
  const [hue, setHue] = useState(150);
  const [isToday, setIsToday] = useState(true);
  const [defaultExpanded, setDefaultExpanded] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [debug, setDebug] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);
  const [hasExecution, setHasExecution] = useState(true);

  const label: Label = {
    id: "showcase-label",
    key: "showcase",
    label: "Showcase",
    hue,
    icon: icon === "none" ? null : icon,
    metadata: null,
    activitySports: ["Run"],
    createdAt: TS,
    updatedAt: TS,
  };

  const metadata: WorkoutMetadata | null =
    type === "optional" ? { optional: true } : type === "rest" ? { ui: { variant: "rest" } } : type === "note" ? { ui: { variant: "note" } } : null;

  const workout: Workout = {
    id: "showcase",
    planId: "plan-1",
    phaseId: null,
    labelId: label.id,
    label,
    date: "2026-04-06",
    title,
    description: description.trim() === "" ? null : description,
    targetDurationMin: durationMin,
    targetDistanceM: distanceM,
    sortOrder: 0,
    status,
    completionNotes: completionNotes.trim() === "" ? null : completionNotes,
    trainerNotes: trainerNotes.trim() === "" ? null : trainerNotes,
    activity: hasActivity ? SAMPLE_ACTIVITY : null,
    execution: hasExecution ? SAMPLE_EXECUTION : null,
    metadata,
    createdAt: TS,
    updatedAt: TS,
  };

  return (
    <div className={styles.storybook}>
      <section className={styles.canvasPane}>
        <ScrollArea.Root style={{ height: "100%" }}>
          <ScrollArea.Viewport fadeout={{ direction: "vertical", size: 32 }}>
            <ScrollArea.Content>
              <div className={styles.canvasInner}>
                <div className={styles.canvasHeader}>
                  <h1 className={dsStyles.sectionTitle}>Workout Card</h1>
                  <p className={dsStyles.description}>Live preview — build a card from every option on the right.</p>
                </div>
                <div className={styles.previewFrame}>
                  {/* Remount when variant/expansion change, since those seed internal open state */}
                  <WorkoutCard
                    key={`${type}-${defaultExpanded}`}
                    workout={workout}
                    dateLabel={dateLabel}
                    isToday={isToday}
                    defaultExpanded={defaultExpanded}
                    readOnly={readOnly}
                    debug={debug}
                    renderDescription={(desc) => <Markdown>{desc}</Markdown>}
                  />
                </div>
              </div>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar />
        </ScrollArea.Root>
      </section>

      <aside className={styles.controlsPane}>
        <ScrollArea.Root style={{ height: "100%" }}>
          <ScrollArea.Viewport fadeout={{ direction: "vertical", size: 24 }}>
            <ScrollArea.Content>
              <div className={styles.controlsInner}>
                <div className={styles.controlsTitle}>Create workout</div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Content</div>
                  <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Input label="Date label" value={dateLabel} placeholder="Mon" onChange={(e) => setDateLabel(e.target.value)} />
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Description</span>
                    <textarea className={styles.textarea} value={description} placeholder="Markdown supported…" onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Trainer notes</span>
                    <textarea className={styles.textarea} value={trainerNotes} onChange={(e) => setTrainerNotes(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Completion notes</span>
                    <textarea className={styles.textarea} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
                  </div>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Targets</div>
                  <div className={styles.twoCol}>
                    <Input
                      label="Duration (min)"
                      type="number"
                      min={0}
                      value={durationMin ?? ""}
                      onChange={(e) => setDurationMin(e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <Input
                      label="Distance (m)"
                      type="number"
                      min={0}
                      value={distanceM ?? ""}
                      onChange={(e) => setDistanceM(e.target.value === "" ? null : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Type</div>
                  <ToggleGroup.Root value={[type]} onValueChange={(v) => v.length > 0 && setType(v[0] as TypeOption)} aria-label="Type">
                    <ToggleGroup.Item value="standard">Standard</ToggleGroup.Item>
                    <ToggleGroup.Item value="optional">Optional</ToggleGroup.Item>
                    <ToggleGroup.Item value="rest">Rest</ToggleGroup.Item>
                    <ToggleGroup.Item value="note">Note</ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Status</div>
                  <ToggleGroup.Root value={[status]} onValueChange={(v) => v.length > 0 && setStatus(v[0] as StatusOption)} aria-label="Status">
                    <ToggleGroup.Item value="planned">Planned</ToggleGroup.Item>
                    <ToggleGroup.Item value="completed">Completed</ToggleGroup.Item>
                    <ToggleGroup.Item value="skipped">Skipped</ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Appearance</div>
                  <Select label="Icon" options={ICON_OPTIONS} value={icon} onValueChange={(v) => v && setIcon(v)} />
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Hue · {hue}°</span>
                    <input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className={dsStyles.hueSlider} />
                  </div>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupTitle}>Behavior</div>
                  <div className={styles.checkList}>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={isToday} onCheckedChange={(v) => setIsToday(!!v)} hue={hue} />
                      <span>Today</span>
                    </label>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={defaultExpanded} onCheckedChange={(v) => setDefaultExpanded(!!v)} hue={hue} />
                      <span>Default expanded</span>
                    </label>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={readOnly} onCheckedChange={(v) => setReadOnly(!!v)} hue={hue} />
                      <span>Read-only</span>
                    </label>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={debug} onCheckedChange={(v) => setDebug(!!v)} hue={hue} />
                      <span>Debug (raw data)</span>
                    </label>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={hasActivity} onCheckedChange={(v) => setHasActivity(!!v)} hue={hue} />
                      <span>Has Strava activity</span>
                    </label>
                    <label className={dsStyles.checkLabel}>
                      <Checkbox checked={hasExecution} onCheckedChange={(v) => setHasExecution(!!v)} hue={hue} />
                      <span>Has Apple Watch file</span>
                    </label>
                  </div>
                </div>
              </div>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar />
        </ScrollArea.Root>
      </aside>
    </div>
  );
}
