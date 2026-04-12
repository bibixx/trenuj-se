import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import styles from "./Badge.module.css";

type BadgeVariant = "default" | "phase" | "optional" | "status" | "premium";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  hue?: number;
  className?: string;
}

export function Badge({ children, variant = "default", hue, className }: BadgeProps) {
  const style = hue != null ? ({ "--hue": hue } as CSSProperties) : undefined;

  return (
    <span className={clsx(styles.badge, styles[variant], className)} style={style} data-ds-badge>
      {children}
    </span>
  );
}
