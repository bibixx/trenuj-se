import { IconChartBar } from "@tabler/icons-react";
import styles from "./AppSplash.module.css";

/**
 * Full-viewport branded loading state for the auth cold load. A CSS
 * animation-delay keeps it invisible for the first ~300ms so fast loads
 * (cached localStorage session) never flash it.
 */
export function AppSplash() {
  return (
    <div className={styles.root} role="status" aria-label="Loading">
      <div className={styles.brand}>
        <IconChartBar aria-hidden />
        trenuj.se
      </div>
    </div>
  );
}
