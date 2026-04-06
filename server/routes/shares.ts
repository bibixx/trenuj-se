import { Hono } from "hono";
import { createServerSupabase, type AppBindings } from "../lib/supabase";

const shareRoutes = new Hono<{ Bindings: AppBindings }>();

shareRoutes.get("/:shareId", async (c) => {
  const shareId = c.req.param("shareId");
  const supabase = createServerSupabase(c);

  const { data: share, error: shareError } = await supabase.from("plan_shares").select("*").eq("id", shareId).single();
  if (shareError || !share || !share.active) {
    return c.json({ error: "Share not found" }, 404);
  }

  const planId = share.plan_id;

  const { data: plan, error: planError } = await supabase.from("plans").select("name, goal, start_date, end_date, status, metadata").eq("id", planId).single();
  if (planError || !plan) {
    return c.json({ error: "Share not found" }, 404);
  }

  const [phasesResult, labelsResult, labelActivitySportsResult] = await Promise.all([
    supabase.from("phases").select("id, name, description, start_date, end_date, sort_order, metadata").eq("plan_id", planId).order("sort_order"),
    supabase.from("labels").select("id, key, label, hue, icon, metadata, created_at, updated_at").eq("plan_id", planId).order("label"),
    supabase.from("label_activity_sports").select("label_id, activity_sport"),
  ]);

  const labelIds = new Set((labelsResult.data ?? []).map((label) => label.id));
  const activitySportsByLabelId = new Map<string, string[]>();
  for (const row of labelActivitySportsResult.data ?? []) {
    if (!labelIds.has(row.label_id)) continue;
    const current = activitySportsByLabelId.get(row.label_id) ?? [];
    current.push(row.activity_sport);
    activitySportsByLabelId.set(row.label_id, current);
  }

  const labels = (labelsResult.data ?? []).map((label) => ({
    ...label,
    activitySports: activitySportsByLabelId.get(label.id) ?? [],
  }));
  const labelsById = new Map(labels.map((label) => [label.id, label]));

  let workouts: Record<string, unknown>[] | null = null;
  let planNotes: Record<string, unknown>[] | null = null;

  if (share.include_workouts) {
    const workoutFields = [
      "id",
      "phase_id",
      "label_id",
      "date",
      "title",
      "description",
      "target_duration_min",
      "target_distance_m",
      "sort_order",
      "status",
      "completion_notes",
      "execution",
      "metadata",
    ];

    if (share.include_trainer_notes) {
      workoutFields.push("trainer_notes");
    }

    if (share.include_activities) {
      workoutFields.push("activity_id", "activities(id, sport, name, date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories)");
    }

    const { data } = await supabase.from("workouts").select(workoutFields.join(", ")).eq("plan_id", planId).order("date").order("sort_order");

    workouts = ((data as Record<string, unknown>[] | null) ?? []).map((workout) => ({
      ...workout,
      label: typeof workout["label_id"] === "string" ? (labelsById.get(workout["label_id"]) ?? null) : null,
    }));
  }

  if (share.include_plan_notes) {
    const { data } = await supabase.from("plan_notes").select("id, type, content, metadata, created_at").eq("plan_id", planId).order("created_at", { ascending: false });
    planNotes = data ?? [];
  }

  return c.json({
    plan,
    phases: phasesResult.data ?? [],
    labels,
    workouts,
    planNotes,
  });
});

export default shareRoutes;
