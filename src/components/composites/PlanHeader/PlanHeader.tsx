import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./PlanHeader.module.css";

function Root({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header className={clsx(styles.root, className)} {...props}>
      {children}
    </header>
  );
}

function Name({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1 className={clsx(styles.name, className)} {...props}>
      {children}
    </h1>
  );
}

function Goal({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx(styles.goal, className)} {...props}>
      {children}
    </p>
  );
}

function Actions({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx(styles.actions, className)} {...props}>
      {children}
    </div>
  );
}

export const PlanHeader = { Root, Name, Goal, Actions };
