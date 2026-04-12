import { Hono } from "hono";
import { createServerSupabase, type AppBindings } from "../lib/supabase";
import { renderOgImage, type OgImageData } from "../lib/og-image.ts";

const ogRoutes = new Hono<{ Bindings: AppBindings }>();

ogRoutes.get("/:shareId", async (c) => {
  const shareId = c.req.param("shareId");
  const supabase = createServerSupabase(c);

  // Validate share
  const { data: share, error: shareError } = await supabase.from("plan_shares").select("plan_id, active").eq("id", shareId).single();
  if (shareError || !share || !share.active) {
    return c.json({ error: "Share not found" }, 404);
  }

  const planId = share.plan_id;

  // Fetch plan + phases + labels + workout count in parallel
  const [planResult, phasesResult, labelsResult, workoutCountResult] = await Promise.all([
    supabase.from("plans").select("name, goal, start_date, end_date").eq("id", planId).single(),
    supabase.from("phases").select("name, start_date, end_date").eq("plan_id", planId).order("sort_order"),
    supabase.from("labels").select("label").eq("plan_id", planId).order("label"),
    supabase.from("workouts").select("id", { count: "exact", head: true }).eq("plan_id", planId),
  ]);

  const plan = planResult.data;
  if (!plan) {
    return c.json({ error: "Share not found" }, 404);
  }

  // Calculate week count from plan dates
  const startDate = new Date(plan.start_date);
  const endDate = plan.end_date ? new Date(plan.end_date) : new Date();
  const weekCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Find the current/first phase
  const phases = phasesResult.data ?? [];
  const now = new Date().toISOString().slice(0, 10);
  const currentPhase = phases.find((p) => p.start_date <= now && p.end_date >= now) ?? phases[0] ?? null;

  const data: OgImageData = {
    planName: plan.name,
    goal: plan.goal,
    phaseName: currentPhase?.name ?? null,
    workoutCount: workoutCountResult.count ?? 0,
    weekCount,
    labelSummary: (labelsResult.data ?? []).map((l) => l.label),
  };

  const png = await renderOgImage(data);

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
});

export default ogRoutes;
