import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import clsx from "clsx";
import { IconCheck, IconMinus, IconX } from "@tabler/icons-react";
import { triggerHaptic } from "tactus";
import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  /** Presentational "skipped" state — renders an X. Independent of `checked`. */
  skipped?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  hue?: number;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function Checkbox({ hue, className, checked, indeterminate, skipped, onCheckedChange, disabled, readOnly }: CheckboxProps) {
  const cls = clsx(styles.root, className);
  const hueStyle = hue != null ? ({ "--checkbox-base-color": `oklch(0.72 0.16 ${hue})` } as React.CSSProperties) : undefined;

  return (
    <BaseCheckbox.Root
      className={cls}
      style={hueStyle}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={
        readOnly
          ? undefined
          : (checked) => {
              triggerHaptic();
              onCheckedChange?.(checked);
            }
      }
      disabled={disabled}
      data-readonly={readOnly || undefined}
      data-skipped={skipped || undefined}
    >
      <BaseCheckbox.Indicator className={styles.indicator} keepMounted>
        {skipped ? <IconX size={14} /> : indeterminate ? <IconMinus size={14} /> : checked ? <IconCheck size={14} /> : null}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
