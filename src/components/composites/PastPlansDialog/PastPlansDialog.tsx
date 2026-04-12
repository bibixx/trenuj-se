import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { plansQueryOptions } from "../../../lib/queries/plans.ts";
import type { Plan } from "../../../lib/types.ts";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import styles from "./PastPlansDialog.module.css";

interface PastPlansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateRange(plan: Plan): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  if (plan.endDate) {
    return `${fmt(plan.startDate)} – ${fmt(plan.endDate)}`;
  }
  return `From ${fmt(plan.startDate)}`;
}

export function PastPlansDialog({ open, onOpenChange }: PastPlansDialogProps) {
  const navigate = useNavigate({ from: "/" });
  const { data: plans = [] } = useQuery({
    ...plansQueryOptions,
    enabled: open,
  });

  const handleSelect = (plan: Plan) => {
    if (plan.status === "active") {
      navigate({ to: "/", search: {}, replace: true });
    } else {
      navigate({ to: "/", search: { planId: plan.id }, replace: true });
    }
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Close />
        <Dialog.Title>Plans</Dialog.Title>

        <div className={styles.list}>
          {plans.map((plan) => (
            <button key={plan.id} className={plan.status === "active" ? styles.itemActive : styles.item} onClick={() => handleSelect(plan)}>
              <div className={styles.itemContent}>
                <span className={styles.itemName}>{plan.name}</span>
                <span className={styles.itemMeta}>{formatDateRange(plan)}</span>
              </div>
            </button>
          ))}
          {plans.length === 0 && <p className={styles.empty}>No plans yet</p>}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
