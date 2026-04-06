import clsx from "clsx";
import { IconCopy, IconCheck, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { useAuth } from "../../../lib/auth.ts";
import { planSharesQueryOptions, useCreateShare, useUpdateShare, useDeleteShare } from "../../../lib/queries/plan-shares.ts";
import type { PlanShare } from "../../../lib/types.ts";
import { Button } from "../../primitives/Button/Button.tsx";
import { Checkbox } from "../../primitives/Checkbox/Checkbox.tsx";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import styles from "./ShareDialog.module.css";

interface ShareDialogProps {
  planId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ planId, open, onOpenChange }: ShareDialogProps) {
  const { user } = useAuth();
  const { data: shares = [] } = useQuery({
    ...planSharesQueryOptions(planId),
    enabled: open,
  });

  const createShare = useCreateShare(planId);

  const handleCreate = () => {
    if (!user) return;
    createShare.mutate(user.id);
  };

  const activeShares = shares.filter((s) => s.active);
  const inactiveShares = shares.filter((s) => !s.active);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Close />
        <Dialog.Title>Share plan</Dialog.Title>
        <Dialog.Description>Create shareable links to your plan. Each link can include different content.</Dialog.Description>

        <div className={styles.shareList}>
          {activeShares.map((share) => (
            <ShareRow key={share.id} share={share} planId={planId} />
          ))}
          {inactiveShares.map((share) => (
            <ShareRow key={share.id} share={share} planId={planId} />
          ))}
          {shares.length === 0 && <p className={styles.emptyText}>No shared links yet</p>}
        </div>

        <div className={styles.dialogFooter}>
          <Button variant="secondary" size="sm" onClick={handleCreate} disabled={createShare.isPending}>
            {createShare.isPending ? "Creating…" : "New share link"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ShareRow({ share, planId }: { share: PlanShare; planId: string }) {
  const updateShare = useUpdateShare(planId);
  const deleteShare = useDeleteShare(planId);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/share/${share.id}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleToggle = (field: keyof Pick<PlanShare, "includeWorkouts" | "includeActivities" | "includeTrainerNotes" | "includePlanNotes">, value: boolean) => {
    updateShare.mutate({ shareId: share.id, updates: { [field]: value } });
  };

  const handleToggleActive = () => {
    updateShare.mutate({ shareId: share.id, updates: { active: !share.active } });
  };

  const handleDelete = () => {
    deleteShare.mutate(share.id);
  };

  return (
    <div className={clsx(styles.shareItem, !share.active && styles.shareItemInactive)}>
      <div className={styles.shareTopRow}>
        <div className={styles.shareLinkRow}>
          <span className={styles.shareLink}>/share/{share.id.slice(0, 14)}…</span>
          {copied ? (
            <span className={styles.copyFeedback}>
              <IconCheck size={14} />
            </span>
          ) : (
            <button className={styles.iconButton} onClick={handleCopy} title="Copy link">
              <IconCopy size={14} />
            </button>
          )}
        </div>
        <div className={styles.shareActions}>
          {!share.active && <span className={styles.deactivatedBadge}>Inactive</span>}
          <Button variant={share.active ? "ghost" : "secondary"} size="sm" onClick={handleToggleActive}>
            {share.active ? "Deactivate" : "Activate"}
          </Button>
          <button className={styles.iconButtonDestructive} onClick={handleDelete} title="Delete share">
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {share.active && (
        <div className={styles.toggleGrid}>
          <label className={styles.toggleRow}>
            <Checkbox checked={share.includeWorkouts} onCheckedChange={(v) => handleToggle("includeWorkouts", v)} />
            <span className={styles.toggleLabel}>Workouts</span>
          </label>
          <label className={styles.toggleRow}>
            <Checkbox checked={share.includeActivities} onCheckedChange={(v) => handleToggle("includeActivities", v)} />
            <span className={styles.toggleLabel}>Activities</span>
          </label>
          <label className={styles.toggleRow}>
            <Checkbox checked={share.includeTrainerNotes} onCheckedChange={(v) => handleToggle("includeTrainerNotes", v)} />
            <span className={styles.toggleLabel}>Trainer notes</span>
          </label>
          <label className={styles.toggleRow}>
            <Checkbox checked={share.includePlanNotes} onCheckedChange={(v) => handleToggle("includePlanNotes", v)} />
            <span className={styles.toggleLabel}>Plan notes</span>
          </label>
        </div>
      )}

      <span className={styles.shareMeta}>Created {formatDate(share.createdAt)}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
