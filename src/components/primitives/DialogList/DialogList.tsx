import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import styles from "./DialogList.module.css";

function Root({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx(styles.list, className)} {...props}>
      {children}
    </div>
  );
}

interface ItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

function Item({ active, className, children, type = "button", ...props }: ItemProps) {
  return (
    <button type={type} className={clsx(styles.item, active && styles.itemActive, className)} {...props}>
      {children}
    </button>
  );
}

function Content({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx(styles.itemContent, className)} {...props}>
      {children}
    </span>
  );
}

function Name({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx(styles.itemName, className)} {...props}>
      {children}
    </span>
  );
}

function Meta({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx(styles.itemMeta, className)} {...props}>
      {children}
    </span>
  );
}

function Empty({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx(styles.empty, className)} {...props}>
      {children}
    </p>
  );
}

export const DialogList = { Root, Item, Content, Name, Meta, Empty };
