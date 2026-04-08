import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "../../../components/primitives/Input/Input.tsx";
import { WorkoutTypeIcon } from "../../../components/domain/WorkoutTypeIcon/WorkoutTypeIcon.tsx";
import { StravaPill } from "../../../components/domain/StravaPill/StravaPill.tsx";
import { Skeleton } from "../../../components/domain/Skeleton/Skeleton.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/domain")({
  component: DomainSection,
});

const iconExamples = ["run", "bike", "swimming", "barbell", "yoga", "mountain", "notes", "\u{1F3C3}\u200D\u2642\uFE0F", "\u{1F4AA}", "\u{1F6B4}", null];

function DomainSection() {
  const [iconInput, setIconInput] = useState("run");

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Domain Primitives</h1>

      <h2 className={styles.subTitle}>WorkoutTypeIcon</h2>
      <div className={styles.row}>
        {iconExamples.map((icon, i) => (
          <div key={i} className={styles.iconDemo}>
            <WorkoutTypeIcon icon={icon} />
            <code className={styles.iconLabel}>{icon === null ? "null" : icon}</code>
          </div>
        ))}
      </div>

      <h3 className={styles.subTitle}>Live Resolution Test</h3>
      <div className={styles.row}>
        <Input label="Icon input" value={iconInput} onChange={(e) => setIconInput(e.target.value)} placeholder="run, bike, 🏊, <svg>..." />
        <div
          style={{
            alignSelf: "flex-end",
            height: 36,
            display: "flex",
            alignItems: "center",
          }}
        >
          <WorkoutTypeIcon icon={iconInput} />
        </div>
      </div>

      <h2 className={styles.subTitle}>StravaPill</h2>
      <div className={styles.row}>
        <StravaPill activityId="1234567890" />
      </div>

      <h2 className={styles.subTitle}>Skeleton</h2>
      <div className={styles.skeletonGrid}>
        <Skeleton variant="text" />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="row" />
        <Skeleton variant="card" />
      </div>
    </div>
  );
}
