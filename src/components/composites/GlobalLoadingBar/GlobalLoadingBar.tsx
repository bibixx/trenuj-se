import { Progress } from "@base-ui/react/progress";
import clsx from "clsx";
import type { AnimationEventHandler } from "react";
import styles from "./GlobalLoadingBar.module.css";

interface GlobalLoadingBarProps {
  /** When false, the bar fades out (it stays mounted so the exit transition plays). */
  visible: boolean;
  className?: string;
  /** Fires once per sweep cycle. Used to defer hiding until the indicator is off-screen. */
  onAnimationIteration?: AnimationEventHandler<HTMLDivElement>;
}

export function GlobalLoadingBar({ visible, className, onAnimationIteration }: GlobalLoadingBarProps) {
  return (
    <Progress.Root value={null} aria-label="Refreshing data" aria-hidden={!visible} data-visible={visible || undefined} className={clsx(styles.root, className)}>
      <Progress.Track className={styles.track}>
        <Progress.Indicator className={styles.indicator} onAnimationIteration={onAnimationIteration} />
      </Progress.Track>
    </Progress.Root>
  );
}
