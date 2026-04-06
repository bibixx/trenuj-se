import { Progress } from "@base-ui-components/react/progress";
import clsx from "clsx";
import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  /** Percentage value from 0 to 100 (e.g. 50 = 50%). */
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <Progress.Root value={value} className={clsx(styles.root, className)}>
      <Progress.Track className={styles.track}>
        <Progress.Indicator className={styles.indicator} />
      </Progress.Track>
    </Progress.Root>
  );
}
