import { Field } from "@base-ui-components/react/field";
import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const cls = clsx(styles.input, error && styles.error, className);

  if (!label && !error) {
    return <input className={cls} id={id} {...props} />;
  }

  return (
    <Field.Root className={styles.field}>
      {label && <Field.Label className={styles.label}>{label}</Field.Label>}
      <Field.Control className={cls} id={id} {...props} render={<input />} />
      {error && <div className={styles.errorText}>{error}</div>}
    </Field.Root>
  );
}
