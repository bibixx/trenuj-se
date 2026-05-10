import { Toast } from "@base-ui/react/toast";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "../../../components/primitives/Button/Button.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/toasts")({
  component: ToastsSection,
});

function ToastsSection() {
  const manager = Toast.useToastManager();

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Toast</h1>
      <p className={styles.description}>Lightweight feedback messages that appear at the bottom of the viewport and auto-dismiss.</p>

      <h2 className={styles.subTitle}>Basic</h2>
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => manager.add({ title: "Workout saved" })}>
          Title only
        </Button>
      </div>

      <h2 className={styles.subTitle}>With Description</h2>
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() =>
            manager.add({
              title: "Plan updated",
              description: "Week 4 workouts have been regenerated.",
            })
          }
        >
          Title + Description
        </Button>
      </div>

      <h2 className={styles.subTitle}>Type Variants</h2>
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() =>
            manager.add({
              title: "Activity synced",
              description: "Morning run matched to Tuesday's workout.",
              type: "success",
            })
          }
        >
          Success
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            manager.add({
              title: "Sync failed",
              description: "Could not connect to Strava. Try again later.",
              type: "error",
            })
          }
        >
          Error
        </Button>
      </div>

      <h2 className={styles.subTitle}>Persistent</h2>
      <p className={styles.description}>Set timeout to 0 — must be manually dismissed via close button or swipe.</p>
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() =>
            manager.add({
              title: "Export ready",
              description: "Your training report is available for download.",
              timeout: 0,
            })
          }
        >
          Persistent toast
        </Button>
      </div>

      <h2 className={styles.subTitle}>Promise</h2>
      <p className={styles.description}>Tracks an async operation — shows loading, then resolves to success or error.</p>
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() => {
            const work = new Promise<void>((resolve) => setTimeout(resolve, 2000));
            manager.promise(work, {
              loading: "Syncing activities…",
              success: "All activities synced",
              error: "Sync failed",
            });
          }}
        >
          Promise (success)
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const work = new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000));
            manager.promise(work, {
              loading: "Syncing activities…",
              success: "All activities synced",
              error: "Sync failed — connection timed out",
            });
          }}
        >
          Promise (error)
        </Button>
      </div>
    </div>
  );
}
