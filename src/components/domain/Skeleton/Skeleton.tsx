import clsx from "clsx";
import styles from "./Skeleton.module.css";

type SkeletonVariant = "text" | "card" | "row";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ variant = "text", width, height, className }: SkeletonProps) {
  return <div className={clsx(styles.skeleton, styles[variant], className)} style={{ width, height }} />;
}
