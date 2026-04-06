import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IconShare, IconSettings } from "@tabler/icons-react";
import { Badge } from "../components/primitives/Badge/Badge.tsx";
import { ScrollAreaComponent as ScrollArea } from "../components/primitives/ScrollArea/ScrollArea.tsx";
import { PlanHeader } from "../components/composites/PlanHeader/PlanHeader.tsx";
import { SessionList } from "../components/composites/SessionList/SessionList.tsx";
import { ShareDialog } from "../components/composites/ShareDialog/ShareDialog.tsx";
import { WeekNavigation } from "../components/composites/WeekNavigation/WeekNavigation.tsx";
import { WeekSummary } from "../components/composites/WeekSummary/WeekSummary.tsx";
import { PlanNote } from "../components/composites/PlanNote/PlanNote.tsx";
import { EmptyPlanState } from "../components/domain/EmptyPlanState/EmptyPlanState.tsx";
import { Skeleton } from "../components/domain/Skeleton/Skeleton.tsx";
import { Markdown } from "../components/markdown/Markdown/Markdown.tsx";
import { useAuth } from "../lib/auth.ts";
import { activePlanQueryOptions } from "../lib/queries/plans.ts";
import { labelsQueryOptions } from "../lib/queries/labels.ts";
import { phasesQueryOptions } from "../lib/queries/phases.ts";
import { workoutsQueryOptions, useToggleCompletion } from "../lib/queries/workouts.ts";
import { planNotesQueryOptions } from "../lib/queries/plan-notes.ts";
import { getPlanWeeks, getCurrentWeekIndex, getWeekDateRange, getWorkoutsForWeek, matchesPlanWeek } from "../lib/week-utils.ts";
import type { Phase, Workout } from "../lib/types.ts";
import type { PlanWeek } from "../lib/week-utils.ts";
import styles from "./index.module.css";

interface SearchParams {
  week?: number;
  debug?: boolean;
}

export const Route = createFileRoute("/")({
  component: PlanView,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const week = Number(search.week);
    return {
      week: Number.isFinite(week) && week > 0 ? week : undefined,
      debug: search.debug === "true" || search.debug === true || undefined,
    };
  },
});

function PlanView() {
  const { user } = useAuth();
  const { week: weekParam, debug = false } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [shareOpen, setShareOpen] = useState(false);

  // --- Data queries ---
  const { data: plan, isLoading: planLoading } = useQuery({
    ...activePlanQueryOptions,
    enabled: !!user,
  });

  const planId = plan?.id ?? null;

  const { data: labels = [] } = useQuery({
    ...labelsQueryOptions(planId!),
    enabled: !!planId,
  });

  const { data: phases = [] } = useQuery({
    ...phasesQueryOptions(planId!),
    enabled: !!planId,
  });

  const { data: workouts = [] } = useQuery({
    ...workoutsQueryOptions(planId!),
    enabled: !!planId,
  });

  const { data: notes = [] } = useQuery({
    ...planNotesQueryOptions(planId!),
    enabled: !!planId,
  });

  const toggleCompletion = useToggleCompletion(planId ?? "");

  // --- Derived state ---
  const weeks = useMemo(() => (plan ? getPlanWeeks(plan.startDate, plan.endDate) : []), [plan]);

  const currentWeek = weekParam ?? getCurrentWeekIndex(weeks);
  const week = weeks[currentWeek - 1] ?? null;

  const weekWorkouts = useMemo(() => (week ? getWorkoutsForWeek(workouts, week) : []), [workouts, week]);

  const weekPhase = useMemo(() => (week ? findPhaseForWeek(phases, week) : null), [phases, week]);

  const weekNote = useMemo(() => {
    if (!week) return null;
    return notes.find((n) => matchesPlanWeek(n.metadata, week)) ?? null;
  }, [notes, week]);

  const completionProgress = useMemo(() => computeProgress(weekWorkouts), [weekWorkouts]);

  const setWeek = (w: number) => {
    navigate({ search: { week: w }, replace: true });
  };

  // --- Loading state ---
  if (planLoading) {
    return (
      <ScrollArea.Root className={styles.scroll}>
        <ScrollArea.Viewport>
          <ScrollArea.Content className={styles.root}>
            <PlanViewSkeleton />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    );
  }

  // --- Empty state ---
  if (!plan) {
    return (
      <ScrollArea.Root className={styles.scroll}>
        <ScrollArea.Viewport>
          <ScrollArea.Content>
            <EmptyPlanState />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    );
  }

  // --- Main view ---
  return (
    <ScrollArea.Root className={styles.scroll}>
      <ScrollArea.Viewport fadeout={{ sizeTop: 32, sizeBottom: 40 }}>
        <ScrollArea.Content className={styles.root} style={{ minWidth: undefined }}>
          <PlanHeader.Root className={styles.header}>
            <PlanHeader.Name>{plan.name}</PlanHeader.Name>
            <PlanHeader.Actions>
              <button className={styles.headerIconButton} onClick={() => setShareOpen(true)} title="Share plan">
                <IconShare size={18} />
              </button>
              <Link to="/settings" className={styles.headerIconButton} title="Settings">
                <IconSettings size={18} />
              </Link>
            </PlanHeader.Actions>
            {plan.goal && <PlanHeader.Goal>{plan.goal}</PlanHeader.Goal>}
          </PlanHeader.Root>

          <ShareDialog planId={plan.id} open={shareOpen} onOpenChange={setShareOpen} />

          {weeks.length > 0 && (
            <>
              <WeekNavigation totalWeeks={weeks.length} currentWeek={currentWeek} onWeekChange={setWeek} />

              {week && (
                <>
                  <WeekSummary.Root>
                    <WeekSummary.Header>
                      {weekPhase && <Badge variant="phase">{weekPhase.name}</Badge>}
                      <WeekSummary.DateRange>{getWeekDateRange(week)}</WeekSummary.DateRange>
                    </WeekSummary.Header>
                    {weekPhase?.description && <WeekSummary.Label>{weekPhase.description}</WeekSummary.Label>}
                    <WeekSummary.Stats>
                      <WeekSummary.Progress value={completionProgress} />
                    </WeekSummary.Stats>
                  </WeekSummary.Root>

                  {weekNote && <PlanNote note={weekNote} renderContent={(c) => <Markdown>{c}</Markdown>} />}

                  <SessionList
                    key={currentWeek}
                    workouts={weekWorkouts}
                    labels={labels}
                    onToggleComplete={(id, completed) => toggleCompletion.mutate({ workoutId: id, completed })}
                    debug={debug}
                  />
                </>
              )}
            </>
          )}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar />
    </ScrollArea.Root>
  );
}

function PlanViewSkeleton() {
  return (
    <>
      <Skeleton variant="text" width="60%" height={24} />
      <Skeleton variant="text" width="40%" height={14} />
      <Skeleton variant="row" height={40} />
      <Skeleton variant="card" />
      <Skeleton variant="row" />
      <Skeleton variant="row" />
      <Skeleton variant="row" />
    </>
  );
}

function findPhaseForWeek(phases: Phase[], week: PlanWeek): Phase | null {
  // Find the phase whose date range overlaps with this week
  for (const p of phases) {
    if (p.startDate <= week.endDate && p.endDate >= week.startDate) {
      return p;
    }
  }
  return null;
}

function computeProgress(workouts: Workout[]): number {
  const checkable = workouts.filter((w) => w.status !== "skipped");
  if (checkable.length === 0) return 0;
  const completed = checkable.filter((w) => w.status === "completed").length;
  return (completed / checkable.length) * 100;
}
