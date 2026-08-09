import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Rendered element — use "section" when the card is a semantic page section. */
  as?: "div" | "section";
  children: ReactNode;
}

export function Card({ as: Tag = "div", children, className, ...props }: CardProps) {
  return (
    <Tag className={clsx(styles.card, className)} {...props}>
      {children}
    </Tag>
  );
}
