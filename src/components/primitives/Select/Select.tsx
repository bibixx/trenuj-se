import { Select as BaseSelect } from "@base-ui-components/react/select";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";
import styles from "./Select.module.css";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function Select({ options, value, onValueChange, placeholder = "Select...", label, className }: SelectProps) {
  return (
    <div className={className}>
      {label && <div className={styles.label}>{label}</div>}
      <BaseSelect.Root value={value} onValueChange={onValueChange}>
        <BaseSelect.Trigger className={styles.trigger}>
          <BaseSelect.Value>{value ?? placeholder}</BaseSelect.Value>
          <BaseSelect.Icon className={styles.icon}>
            <IconChevronDown size={16} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className={styles.positioner}>
            <BaseSelect.Popup className={styles.popup}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}

function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseSelect.Item value={value} className={styles.item}>
      <BaseSelect.ItemIndicator className={styles.itemIndicator}>
        <IconCheck size={14} />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
