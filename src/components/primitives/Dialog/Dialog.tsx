import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import clsx from "clsx";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

function DialogRoot({ open, onOpenChange, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </BaseDialog.Root>
  );
}

function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={styles.backdrop} />
      <BaseDialog.Popup className={clsx(styles.content, className)}>{children}</BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogTitle({ children }: { children: ReactNode }) {
  return <BaseDialog.Title className={styles.title}>{children}</BaseDialog.Title>;
}

function DialogDescription({ children }: { children: ReactNode }) {
  return <BaseDialog.Description className={styles.description}>{children}</BaseDialog.Description>;
}

function DialogClose({ className }: { className?: string }) {
  return (
    <BaseDialog.Close className={clsx(styles.close, className)}>
      <IconX size={18} />
    </BaseDialog.Close>
  );
}

export const Dialog = {
  Root: DialogRoot,
  Trigger: BaseDialog.Trigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
};
