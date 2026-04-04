import { Hono } from "hono";
import { createServerSupabase, type AppBindings } from "../lib/supabase";

const shareRoutes = new Hono<{ Bindings: AppBindings }>();

shareRoutes.get("/:shareId", async (c) => {
  const shareId = c.req.param("shareId");
  const supabase = createServerSupabase(c);

  // 1. Look up the share (service role bypasses RLS)
  const { data: share, error: shareError } = await supabase.from("plan_shares").select("*").eq("id", shareId).single();

  if (shareError || !share || !share.active) {
    return c.json({ error: "Share not found" }, 404);
  }

  const planId = share.plan_id;

  // 2. Fetch plan (always included)
  const { data: plan, error: planError } = await supabase.from("plans").select("name, goal, start_date, end_date, status, color_by, metadata").eq("id", planId).single();

  if (planError || !plan) {
    return c.json({ error: "Share not found" }, 404);
  }

  // 3. Fetch phases and workout types in parallel (always included)
  const [phasesResult, workoutTypesResult] = await Promise.all([
    supabase.from("phases").select("id, name, description, start_date, end_date, sort_order, metadata").eq("plan_id", planId).order("sort_order"),
    supabase.from("workout_types").select("key, label, hue, icon, sort_order").eq("plan_id", planId).order("sort_order"),
  ]);

  // 4. Conditionally fetch workouts, activities, plan notes
  let workouts: Record<string, unknown>[] | null = null;
  let planNotes: Record<string, unknown>[] | null = null;

  if (share.include_workouts) {
    const workoutFields = [
      "id",
      "phase_id",
      "date",
      "sport",
      "category",
      "title",
      "description",
      "target_duration_min",
      "target_distance_m",
      "sort_order",
      "status",
      "completion_notes",
      "metadata",
    ];

    if (share.include_trainer_notes) {
      workoutFields.push("trainer_notes");
    }

    if (share.include_activities) {
      workoutFields.push("activity_id", "activities(id, sport, name, date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories)");
    }

    const { data } = await supabase.from("workouts").select(workoutFields.join(", ")).eq("plan_id", planId).order("date").order("sort_order");

    workouts = (data as Record<string, unknown>[] | null) ?? [];
  }

  if (share.include_plan_notes) {
    const { data } = await supabase.from("plan_notes").select("id, type, content, metadata, created_at").eq("plan_id", planId).order("created_at", { ascending: false });

    planNotes = data ?? [];
  }

  return c.json({
    plan,
    phases: phasesResult.data ?? [],
    workoutTypes: workoutTypesResult.data ?? [],
    workouts,
    planNotes,
  });
});

export default shareRoutes;
