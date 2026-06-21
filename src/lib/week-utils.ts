import type { PlanNoteMetadata } from "../../shared/plan-note-metadata.ts";
import { getUiVariant, isCheckable, type Workout } from "./types.ts";

export interface PlanWeek {
  /** 1-based week number */
  week: number;
  startDate: string;
  endDate: string;
}

export type DateRange = Pick<PlanWeek, "startDate" | "endDate">;

export interface WorkoutDateGroup {
  date: string;
  workouts: Workout[];
}

/**
 * Split a plan's date range into ISO weeks (Mon–Sun).
 * If endDate is null, generates weeks up to current date + 2 weeks.
 */
export function getPlanWeeks(startDate: string, endDate?: string | null): PlanWeek[] {
  const start = new Date(startDate);
  // Align to Monday (ISO week start)
  const dayOfWeek = start.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(start);
  firstMonday.setUTCDate(firstMonday.getUTCDate() + mondayOffset);

  const end = endDate ? new Date(endDate) : new Date();
  if (!endDate) {
    // Extend 2 weeks past today
    end.setUTCDate(end.getUTCDate() + 14);
  }

  const weeks: PlanWeek[] = [];
  let weekStart = new Date(firstMonday);
  let weekNum = 1;

  while (weekStart <= end) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    weeks.push({
      week: weekNum,
      startDate: toDateString(weekStart),
      endDate: toDateString(weekEnd),
    });

    weekStart = new Date(weekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() + 7);
    weekNum++;
  }

  return weeks;
}

/** Returns the 1-based week index that contains today, clamped to [1, weeks.length]. */
export function getCurrentWeekIndex(weeks: PlanWeek[]): number {
  if (weeks.length === 0) return 1;

  const today = toDateString(new Date());

  for (const w of weeks) {
    if (today >= w.startDate && today <= w.endDate) {
      return w.week;
    }
  }

  // If today is before the plan, return first week; if after, return last
  if (today < weeks[0]!.startDate) return 1;
  return weeks[weeks.length - 1]!.week;
}

/** Returns the 1-based week index that contains today, or null when today is outside the plan. */
export function getTodayWeekIndex(weeks: PlanWeek[]): number | null {
  const today = toDateString(new Date());
  const week = weeks.find((w) => today >= w.startDate && today <= w.endDate);
  return week?.week ?? null;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a week's date range as "Apr 7 – Apr 13". */
export function getWeekDateRange(week: PlanWeek): string {
  const start = new Date(week.startDate);
  const end = new Date(week.endDate);

  const startMonth = SHORT_MONTHS[start.getUTCMonth()]!;
  const endMonth = SHORT_MONTHS[end.getUTCMonth()]!;

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getUTCDate()} – ${end.getUTCDate()}`;
  }
  return `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}`;
}

/** Get ISO week key like "2026-W15" for matching plan_notes.metadata.week. */
export function getWeekIsoKey(week: PlanWeek): string {
  // The ISO week number is derived from the Thursday of that week
  const thursday = new Date(week.startDate);
  thursday.setUTCDate(thursday.getUTCDate() + 3);

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const daysDiff = Math.floor((thursday.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((daysDiff + 1) / 7);

  return `${thursday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/** Check whether note metadata belongs to the given plan week. */
export function matchesPlanWeek(metadata: PlanNoteMetadata | null | undefined, week: PlanWeek): boolean {
  const value = metadata?.week;
  if (typeof value === "number") return value === week.week;
  if (typeof value === "string") return value === getWeekIsoKey(week);
  return false;
}

/** Return all date strings in a range, inclusive. */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(toDateString(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/** Check if a date string (YYYY-MM-DD) is today. */
export function isToday(dateStr: string): boolean {
  return dateStr === toDateString(new Date());
}

/** Group workouts by date, preserving sort order within each group. */
export function groupWorkoutsByDate(workouts: Workout[]): Map<string, Workout[]> {
  const map = new Map<string, Workout[]>();
  for (const w of workouts) {
    const existing = map.get(w.date);
    if (existing) {
      existing.push(w);
    } else {
      map.set(w.date, [w]);
    }
  }
  return map;
}

/** Build display-ready workout groups. If a range is provided, include empty groups for missing days. */
export function getWorkoutDateGroups(workouts: Workout[], range?: DateRange | null): WorkoutDateGroup[] {
  const grouped = groupWorkoutsByDate(workouts);

  if (!range) {
    return Array.from(grouped.entries()).map(([date, dayWorkouts]) => ({ date, workouts: dayWorkouts }));
  }

  return getDatesInRange(range.startDate, range.endDate).map((date) => ({ date, workouts: grouped.get(date) ?? [] }));
}

/** Filter workouts to those within a given week's date range. */
export function getWorkoutsForWeek(workouts: Workout[], week: PlanWeek): Workout[] {
  return workouts.filter((w) => w.date >= week.startDate && w.date <= week.endDate);
}

/**
 * Percentage of checkable workouts completed.
 * Skipped workouts are excluded from the denominator — a skip is a resolved
 * outcome, not an outstanding workout, so it neither counts toward nor against
 * completion. Returns 0 when no checkable, non-skipped workouts remain.
 */
export function computeProgress(workouts: Workout[]): number {
  const eligible = workouts.filter((w) => isCheckable(getUiVariant(w)) && w.status !== "skipped");
  if (eligible.length === 0) return 0;
  const completed = eligible.filter((w) => w.status === "completed").length;
  return (completed / eligible.length) * 100;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
