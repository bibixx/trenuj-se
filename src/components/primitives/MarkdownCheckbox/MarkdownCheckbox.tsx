import clsx from "clsx";
import { IconCheck } from "@tabler/icons-react";
import styles from "./MarkdownCheckbox.module.css";

interface MarkdownCheckboxProps {
  checked?: boolean;
  className?: string;
}

export function MarkdownCheckbox({ checked, className }: MarkdownCheckboxProps) {
  return (
    <span className={clsx(styles.root, checked && styles.checked, className)} aria-hidden>
      {checked && <IconCheck size={10} />}
    </span>
  );
}
