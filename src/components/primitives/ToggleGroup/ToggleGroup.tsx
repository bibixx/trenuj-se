import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import clsx from "clsx";
import type { ReactNode } from "react";
import { triggerHaptic } from "tactus";
import styles from "./ToggleGroup.module.css";

interface RootProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

function Root({ value, onValueChange, className, children, ...props }: RootProps) {
  return (
    <BaseToggleGroup
      value={value}
      onValueChange={(v) => {
        triggerHaptic();
        onValueChange(v);
      }}
      className={clsx(styles.root, className)}
      {...props}
    >
      {children}
    </BaseToggleGroup>
  );
}

interface ItemProps {
  value: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}

function Item({ value, className, children, disabled }: ItemProps) {
  return (
    <BaseToggle value={value} className={clsx(styles.item, className)} disabled={disabled}>
      {children}
    </BaseToggle>
  );
}

export const ToggleGroup = { Root, Item };
