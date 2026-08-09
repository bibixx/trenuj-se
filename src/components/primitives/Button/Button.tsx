import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { IconLoader2 } from "@tabler/icons-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { triggerHaptic } from "tactus";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "default" | "sm";

type ButtonProps = BaseButtonProps &
  React.RefAttributes<HTMLElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    className?: string;
    icon?: ReactNode;
    children?: ReactNode;
  };

export function Button({ variant = "primary", size = "default", className, icon, children, onClick, disabled, loading = false, ...props }: ButtonProps) {
  const resolvedIcon = loading ? <IconLoader2 className="spin" /> : icon;
  const hasIcon = resolvedIcon != null;
  const iconOnly = hasIcon && children == null;

  return (
    <BaseButton
      className={clsx(styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, hasIcon && !iconOnly && styles.hasIcon, className)}
      disabled={disabled || loading}
      onClick={() => {
        triggerHaptic();
        onClick?.();
      }}
      {...props}
    >
      {hasIcon && <span className={styles.icon}>{resolvedIcon}</span>}
      {children}
    </BaseButton>
  );
}
