import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import type { Plan } from "../../../lib/types.ts";
import styles from "./AgentMemoryDialog.module.css";

interface AgentMemoryDialogProps {
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentMemoryDialog({ plan, open, onOpenChange }: AgentMemoryDialogProps) {
  const memory = plan.agentMemory?.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className={styles.dialog}>
        <Dialog.Close />
        <Dialog.Title>Agent notes</Dialog.Title>

        {memory ? (
          <Markdown>{memory}</Markdown>
        ) : (
          <p className={styles.empty}>No agent notes yet. As the agent works on this plan, it can record pace/HR zones, constraints, and reminders here.</p>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
