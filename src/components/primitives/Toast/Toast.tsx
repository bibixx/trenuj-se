import { Toast as BaseToast } from "@base-ui-components/react/toast";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import styles from "./Toast.module.css";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      {children}
      <BaseToast.Viewport className={styles.viewport}>
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Provider>
  );
}

export function ToastRoot({ toast, children }: { toast: { id: string }; children: ReactNode }) {
  return (
    <BaseToast.Root toast={toast} className={styles.root}>
      {children}
    </BaseToast.Root>
  );
}

export function ToastTitle({ children }: { children: ReactNode }) {
  return <BaseToast.Title className={styles.title}>{children}</BaseToast.Title>;
}

export function ToastDescription({ children }: { children: ReactNode }) {
  return <BaseToast.Description className={styles.description}>{children}</BaseToast.Description>;
}

export function ToastClose() {
  return (
    <BaseToast.Close className={styles.close}>
      <IconX size={14} />
    </BaseToast.Close>
  );
}

export function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <ToastRoot key={toast.id} toast={toast}>
      {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
      {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
      <ToastClose />
    </ToastRoot>
  ));
}
