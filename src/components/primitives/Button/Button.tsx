import { Button as BaseButton } from "@base-ui-components/react/button";
import clsx from "clsx";
import type { ReactNode } from "react";
import { triggerHaptic } from "tactus";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "default" | "sm";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Button({ variant = "primary", size = "default", className, icon, children, onClick, ...props }: ButtonProps) {
  const hasIcon = icon != null;
  const iconOnly = hasIcon && children == null;

  return (
    <BaseButton
      className={clsx(styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, hasIcon && !iconOnly && styles.hasIcon, className)}
      onClick={() => {
        triggerHaptic();
        onClick?.();
      }}
      {...props}
    >
      {hasIcon && <span className={styles.icon}>{icon}</span>}
      {children}
    </BaseButton>
  );
}
