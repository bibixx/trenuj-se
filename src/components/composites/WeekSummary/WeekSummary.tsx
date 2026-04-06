import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "../../primitives/Card/Card.tsx";
import { ProgressBar } from "../../primitives/ProgressBar/ProgressBar.tsx";
import styles from "./WeekSummary.module.css";

function Root({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={clsx(styles.root, className)} {...props}>
      {children}
    </Card>
  );
}

function Header({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx(styles.header, className)} {...props}>
      {children}
    </div>
  );
}

function DateRange({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx(styles.weekRange, className)} {...props}>
      {children}
    </span>
  );
}

function Label({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx(styles.weekLabel, className)} {...props}>
      {children}
    </p>
  );
}

function Stats({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx(styles.stats, className)} {...props}>
      {children}
    </div>
  );
}

interface ProgressProps {
  value: number;
  className?: string;
}

function Progress({ value, className }: ProgressProps) {
  return (
    <div className={clsx(styles.progressRow, className)}>
      <ProgressBar value={value} />
      <span className={styles.progressLabel}>{Math.round(value)}%</span>
    </div>
  );
}

function Volume({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx(styles.volume, className)} {...props}>
      {children}
    </span>
  );
}

export const WeekSummary = { Root, Header, DateRange, Label, Stats, Progress, Volume };
