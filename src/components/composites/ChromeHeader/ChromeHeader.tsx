import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./ChromeHeader.module.css";
import { Button } from "../../primitives/Button/Button";
import { Link } from "@tanstack/react-router";
import { IconChartBar } from "@tabler/icons-react";

function Root({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header className={clsx(styles.root, className)} {...props}>
      <div className={styles.brand}>
        <Button className={styles.name} variant="ghost" nativeButton={false} render={<Link to="/" />} icon={<IconChartBar />}>
          trenuj.se
        </Button>
      </div>
      {children}
    </header>
  );
}

function Actions({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx(styles.actions, className)} {...props}>
      {children}
    </div>
  );
}

export const ChromeHeader = { Root, Actions };
