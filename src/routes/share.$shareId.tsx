import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge } from "../components/primitives/Badge/Badge.tsx";
import { Card } from "../components/primitives/Card/Card.tsx";
import { ScrollAreaComponent as ScrollArea } from "../components/primitives/ScrollArea/ScrollArea.tsx";
import { PlanHeader } from "../components/composites/PlanHeader/PlanHeader.tsx";
import { PlanNote } from "../components/composites/PlanNote/PlanNote.tsx";
import { SessionList } from "../components/composites/SessionList/SessionList.tsx";
import { WeekNavigation } from "../components/composites/WeekNavigation/WeekNavigation.tsx";
import { WeekSummary } from "../components/composites/WeekSummary/WeekSummary.tsx";
import { Skeleton } from "../components/domain/Skeleton/Skeleton.tsx";
import { Markdown } from "../components/markdown/Markdown/Markdown.tsx";
import { shareQueryOptions, ShareNotFoundError } from "../lib/queries/shares.ts";
import { getUiVariant, isCheckable, type Phase, type Workout } from "../lib/types.ts";
import type { PlanWeek } from "../lib/week-utils.ts";
import { getPlanWeeks, getCurrentWeekIndex, getWeekDateRange, getWorkoutsForWeek, matchesPlanWeek } from "../lib/week-utils.ts";
import styles from "./share.$shareId.module.css";

interface SearchParams {
  week?: number;
}

export const Route = createFileRoute("/share/$shareId")({
  component: SharedPlanView,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const week = Number(search.week);
    return {
      week: Number.isFinite(week) && week > 0 ? week : undefined,
    };
  },
});

function SharedPlanView() {
  const { shareId } = Route.useParams();
  const { week: weekParam } = Route.useSearch();
  const navigate = useNavigate({ from: "/share/$shareId" });

  const { data, isLoading, error } = useQuery(shareQueryOptions(shareId));

  const plan = data?.plan ?? null;
  const phases = data?.phases ?? [];
  const labels = data?.labels ?? [];
  const workouts = data?.workouts ?? null;
  const notes = data?.planNotes ?? null;

  // --- Derived state ---
  const weeks = useMemo(() => (plan ? getPlanWeeks(plan.startDate, plan.endDate) : []), [plan]);

  const currentWeek = weekParam ?? getCurrentWeekIndex(weeks);
  const week = weeks[currentWeek - 1] ?? null;

  const weekWorkouts = useMemo(() => (week && workouts ? getWorkoutsForWeek(workouts, week) : []), [workouts, week]);

  const weekPhase = useMemo(() => (week ? findPhaseForWeek(phases, week) : null), [phases, week]);

  const weekNote = useMemo(() => {
    if (!week || !notes) return null;
    return notes.find((n) => matchesPlanWeek(n.metadata, week)) ?? null;
  }, [notes, week]);

  const completionProgress = useMemo(() => computeProgress(weekWorkouts), [weekWorkouts]);

  const setWeek = (w: number) => {
    navigate({ search: { week: w }, replace: true });
  };

  // --- Error state ---
  if (error) {
    const is404 = error instanceof ShareNotFoundError;
    return (
      <div className={styles.errorRoot}>
        <Card className={styles.errorCard}>
          <p className={styles.errorTitle}>{is404 ? "Share not found" : "Something went wrong"}</p>
          <p className={styles.errorDescription}>
            {is404 ? "This shared plan is no longer available or the link may be incorrect." : "We couldn't load this shared plan. Please try again later."}
          </p>
        </Card>
      </div>
    );
  }

  // --- Loading state ---
  if (isLoading || !plan) {
    return (
      <ScrollArea.Root className={styles.scroll}>
        <ScrollArea.Viewport>
          <ScrollArea.Content className={styles.root}>
            <SharedPlanSkeleton />
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
            {plan.goal && <PlanHeader.Goal>{plan.goal}</PlanHeader.Goal>}
          </PlanHeader.Root>

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
                    {workouts != null && (
                      <WeekSummary.Stats>
                        <WeekSummary.Progress value={completionProgress} />
                      </WeekSummary.Stats>
                    )}
                  </WeekSummary.Root>

                  {weekNote && <PlanNote note={weekNote} renderContent={(c) => <Markdown>{c}</Markdown>} />}

                  {workouts != null && <SessionList key={currentWeek} workouts={weekWorkouts} labels={labels} readOnly />}
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

function SharedPlanSkeleton() {
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
