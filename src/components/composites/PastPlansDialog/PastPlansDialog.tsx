import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { plansQueryOptions } from "../../../lib/queries/plans.ts";
import type { Plan } from "../../../lib/types.ts";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import { DialogList } from "../../primitives/DialogList/DialogList.tsx";

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

        {plans.length === 0 ? (
          <DialogList.Empty>No plans yet</DialogList.Empty>
        ) : (
          <DialogList.Root>
            {plans.map((plan) => (
              <DialogList.Item key={plan.id} active={plan.status === "active"} onClick={() => handleSelect(plan)}>
                <DialogList.Content>
                  <DialogList.Name>{plan.name}</DialogList.Name>
                  <DialogList.Meta>{formatDateRange(plan)}</DialogList.Meta>
                </DialogList.Content>
              </DialogList.Item>
            ))}
          </DialogList.Root>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
