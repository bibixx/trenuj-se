import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IconHistory, IconShare, IconSettings, IconNotebook } from "@tabler/icons-react";
import { Badge } from "../../components/primitives/Badge/Badge.tsx";
import { Button } from "../../components/primitives/Button/Button.tsx";
import { Tooltip } from "../../components/primitives/Tooltip/Tooltip.tsx";
import { AgentMemoryDialog } from "../../components/composites/AgentMemoryDialog/AgentMemoryDialog.tsx";
import { PastPlansDialog } from "../../components/composites/PastPlansDialog/PastPlansDialog.tsx";
import { PlanHeader } from "../../components/composites/PlanHeader/PlanHeader.tsx";
import { SessionList } from "../../components/composites/SessionList/SessionList.tsx";
import { ShareDialog } from "../../components/composites/ShareDialog/ShareDialog.tsx";
import { WeekNavigation } from "../../components/composites/WeekNavigation/WeekNavigation.tsx";
import { WeekSummary } from "../../components/composites/WeekSummary/WeekSummary.tsx";
import { PlanNote } from "../../components/composites/PlanNote/PlanNote.tsx";
import { PageLayout } from "../../components/composites/PageLayout/PageLayout.tsx";
import { EmptyPlanState } from "../../components/domain/EmptyPlanState/EmptyPlanState.tsx";
import { Skeleton } from "../../components/domain/Skeleton/Skeleton.tsx";
import { Markdown } from "../../components/markdown/Markdown/Markdown.tsx";
import { useAuth } from "../../lib/auth.ts";
import { activePlanQueryOptions, planQueryOptions } from "../../lib/queries/plans.ts";
import { labelsQueryOptions } from "../../lib/queries/labels.ts";
import { phasesQueryOptions } from "../../lib/queries/phases.ts";
import { workoutsQueryOptions, useToggleCompletion } from "../../lib/queries/workouts.ts";
import { planNotesQueryOptions } from "../../lib/queries/plan-notes.ts";
import { getPlanWeeks, getCurrentWeekIndex, getTodayWeekIndex, getWeekDateRange, getWorkoutsForWeek, matchesPlanWeek } from "../../lib/week-utils.ts";
import { getUiVariant, isCheckable, type Phase, type Workout } from "../../lib/types.ts";
import type { PlanWeek } from "../../lib/week-utils.ts";
import styles from "./index.module.css";

interface SearchParams {
  planId?: string;
  week?: number;
  debug?: boolean;
}

export const Route = createFileRoute("/_app/")({
  component: PlanView,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const week = Number(search.week);
    const planId = typeof search.planId === "string" && search.planId.length > 0 ? search.planId : undefined;
    return {
      planId,
      week: Number.isFinite(week) && week > 0 ? week : undefined,
      debug: search.debug === "true" || search.debug === true || undefined,
    };
  },
});

function PlanView() {
  const { user } = useAuth();
  const { planId: planIdParam, week: weekParam, debug = false } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [shareOpen, setShareOpen] = useState(false);
  const [pastPlansOpen, setPastPlansOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  // --- Data queries ---
  const { data: activePlan, isLoading: activePlanLoading } = useQuery({
    ...activePlanQueryOptions,
    enabled: !!user,
  });

  const { data: selectedPlan, isLoading: selectedPlanLoading } = useQuery({
    ...planQueryOptions(planIdParam!),
    enabled: !!user && !!planIdParam,
  });

  const plan = planIdParam ? selectedPlan : activePlan;
  const planLoading = planIdParam ? selectedPlanLoading : activePlanLoading;
  const isInactive = plan?.status === "inactive";

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

  const currentWeek = getTodayWeekIndex(weeks);
  const selectedWeek = weekParam ?? getCurrentWeekIndex(weeks);
  const week = weeks[selectedWeek - 1] ?? null;

  const weekWorkouts = useMemo(() => (week ? getWorkoutsForWeek(workouts, week) : []), [workouts, week]);

  const weekPhase = useMemo(() => (week ? findPhaseForWeek(phases, week) : null), [phases, week]);

  const weekNote = useMemo(() => {
    if (!week) return null;
    return notes.find((n) => matchesPlanWeek(n.metadata, week)) ?? null;
  }, [notes, week]);

  const completionProgress = useMemo(() => computeProgress(weekWorkouts), [weekWorkouts]);

  const setWeek = (w: number) => {
    navigate({ search: (prev) => ({ ...prev, week: w }), replace: true });
  };

  const headerActions = (
    <Tooltip.Provider>
      <Tooltip label="Past plans">
        <Button icon={<IconHistory />} variant="ghost" onClick={() => setPastPlansOpen(true)} />
      </Tooltip>
      {!isInactive && (
        <Tooltip label="Share">
          <Button icon={<IconShare />} variant="ghost" onClick={() => setShareOpen(true)} />
        </Tooltip>
      )}
      {plan && (
        <Tooltip label="Agent notes">
          <Button icon={<IconNotebook />} variant="ghost" onClick={() => setMemoryOpen(true)} />
        </Tooltip>
      )}
      <Tooltip label="Settings">
        <Button icon={<IconSettings />} variant="ghost" nativeButton={false} render={<Link to="/settings" />} />
      </Tooltip>
    </Tooltip.Provider>
  );

  // --- Loading state ---
  if (!user || planLoading) {
    return (
      <PageLayout headerActions={headerActions}>
        <PlanViewSkeleton />
      </PageLayout>
    );
  }

  // --- Empty state ---
  if (!plan) {
    return (
      <PageLayout headerActions={headerActions}>
        <EmptyPlanState onPastPlansClick={() => setPastPlansOpen(true)} />
        <PastPlansDialog open={pastPlansOpen} onOpenChange={setPastPlansOpen} />
      </PageLayout>
    );
  }

  // --- Main view ---
  return (
    <PageLayout headerActions={headerActions}>
      <PlanHeader.Root className={styles.header}>
        <PlanHeader.Name>
          {plan.name}
          {isInactive && <Badge className={styles.inactiveBadge}>Inactive</Badge>}
        </PlanHeader.Name>
        {plan.goal && <PlanHeader.Goal>{plan.goal}</PlanHeader.Goal>}
      </PlanHeader.Root>

      <PastPlansDialog open={pastPlansOpen} onOpenChange={setPastPlansOpen} />
      {!isInactive && <ShareDialog planId={plan.id} open={shareOpen} onOpenChange={setShareOpen} />}
      <AgentMemoryDialog plan={plan} open={memoryOpen} onOpenChange={setMemoryOpen} />

      {weeks.length > 0 && (
        <>
          <WeekNavigation totalWeeks={weeks.length} selectedWeek={selectedWeek} currentWeek={currentWeek} onWeekChange={setWeek} />

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
                key={selectedWeek}
                workouts={weekWorkouts}
                labels={labels}
                dateRange={week}
                onToggleComplete={isInactive ? undefined : (id, completed) => toggleCompletion.mutate({ workoutId: id, completed })}
                readOnly={isInactive}
                debug={debug}
              />
            </>
          )}
        </>
      )}
    </PageLayout>
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
  for (const p of phases) {
    if (p.startDate <= week.endDate && p.endDate >= week.startDate) {
      return p;
    }
  }
  return null;
}

function computeProgress(workouts: Workout[]): number {
  const checkable = workouts.filter((w) => isCheckable(getUiVariant(w)));
  if (checkable.length === 0) return 0;
  const completed = checkable.filter((w) => w.status === "completed").length;
  return (completed / checkable.length) * 100;
}
