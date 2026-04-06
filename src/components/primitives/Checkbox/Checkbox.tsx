import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import clsx from "clsx";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  hue?: number;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function Checkbox({ hue, className, checked, indeterminate, onCheckedChange, disabled, readOnly }: CheckboxProps) {
  const cls = clsx(styles.root, className);
  const hueStyle = hue != null ? ({ "--checkbox-base-color": `oklch(0.72 0.16 ${hue})` } as React.CSSProperties) : undefined;

  return (
    <BaseCheckbox.Root
      className={cls}
      style={hueStyle}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={readOnly ? undefined : onCheckedChange}
      disabled={disabled}
      data-readonly={readOnly || undefined}
    >
      <BaseCheckbox.Indicator className={styles.indicator} keepMounted>
        {indeterminate ? <IconMinus size={14} /> : checked ? <IconCheck size={14} /> : null}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
