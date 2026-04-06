import { Button as BaseButton } from "@base-ui-components/react/button";
import clsx from "clsx";
import type { ReactNode } from "react";
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
  children?: ReactNode;
}

export function Button({ variant = "primary", size = "default", className, children, ...props }: ButtonProps) {
  return (
    <BaseButton className={clsx(styles.button, styles[variant], styles[size], className)} {...props}>
      {children}
    </BaseButton>
  );
}
