import { type Context, Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { encode } from "@bibixx/workoutkit/encode";
import { buildWorkoutPlanFromExecution } from "../../shared/workout-plan";
import type { WorkoutExecution } from "../../shared/workout-execution";
import { AppError, errorPayload } from "../mcp/context";
import { type AppBindings, createServerSupabase } from "../lib/supabase";
import { createWatchToken, verifyWatchToken } from "../lib/watch-tokens";

type Variables = { userId: string };
type Env = { Bindings: AppBindings; Variables: Variables };

type WorkoutRow = { id: string; title: string; date: string; execution: WorkoutExecution | null };

const watchRoutes = new Hono<Env>();

// Supabase-session auth (mirrors server/routes/strava.ts) — used only to mint a token.
const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ code: "AUTH_ERROR", message: "Missing bearer token" }, 401);
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  const supabase = createServerSupabase(c);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return c.json({ code: "AUTH_ERROR", message: "Invalid or expired session token" }, 401);
  }

  c.set("userId", data.user.id);
  await next();
};

function requireWatchSecret(c: Context<Env>): string {
  const secret = c.env.WATCH_TOKEN_SECRET;
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "Missing WATCH_TOKEN_SECRET binding");
  }
  return secret;
}

// Resolve a watch token (Bearer header or `?token=`) to a userId, or throw.
async function authWatch(c: Context<Env>): Promise<string> {
  const secret = requireWatchSecret(c);
  const bearer = c.req
    .header("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const rawToken = bearer || c.req.query("token");
  if (!rawToken) {
    throw new AppError("AUTH_ERROR", "Missing watch token");
  }
  const userId = await verifyWatchToken(secret, rawToken);
  if (!userId) {
    throw new AppError("AUTH_ERROR", "Invalid watch token");
  }
  return userId;
}

function errorResponse(c: Context<Env>, error: unknown) {
  const payload = errorPayload(error);
  const status = payload.code === "AUTH_ERROR" ? 401 : payload.code === "NOT_FOUND" ? 404 : 500;
  return c.json(payload, status);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Mint a long-lived watch token (authenticated via the normal Supabase session).
// The user pastes the result into the companion app once.
watchRoutes.get("/token", requireUser, async (c) => {
  const userId = c.get("userId");
  const token = await createWatchToken(requireWatchSecret(c), userId);
  return c.json({ token });
});

// Generic feed manifest: a plain list of upcoming workouts pointing at individual `.workout`
// files via relative URLs (the client resolves them against this manifest's URL). Any static
// host can serve this shape — trenuj.se just generates it per-user. Authed by the watch token.
watchRoutes.get("/index.json", async (c) => {
  try {
    const userId = await authWatch(c);
    const days = z.coerce.number().int().min(1).max(60).catch(14).parse(c.req.query("days"));
    const now = new Date();
    const from = isoDate(now);
    const to = isoDate(new Date(now.getTime() + days * 24 * 60 * 60 * 1000));

    const supabase = createServerSupabase(c);
    const { data, error } = await supabase
      .from("workouts")
      .select("id, title, date, execution")
      .eq("user_id", userId)
      .eq("status", "planned")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (error) {
      throw new AppError("INTERNAL_ERROR", error.message);
    }

    const rows = (data ?? []) as WorkoutRow[];
    const workouts = rows
      .filter((row) => row.execution !== null)
      .map((row) => ({
        id: row.id,
        date: `${row.date}T07:00:00`,
        url: `w/${row.id}.workout`,
        type: "workout",
        title: row.title,
      }));

    return c.json({ version: 1, workouts });
  } catch (error) {
    return errorResponse(c, error);
  }
});

// A single workout as raw Apple `.workout` bytes, referenced (relatively) by the manifest.
watchRoutes.get("/w/:file", async (c) => {
  try {
    const userId = await authWatch(c);
    const parsed = z
      .string()
      .uuid()
      .safeParse(c.req.param("file").replace(/\.workout$/, ""));
    if (!parsed.success) {
      throw new AppError("NOT_FOUND", "Workout not found");
    }

    const supabase = createServerSupabase(c);
    const { data, error } = await supabase.from("workouts").select("id, title, date, execution").eq("user_id", userId).eq("id", parsed.data).maybeSingle();

    if (error) {
      throw new AppError("INTERNAL_ERROR", error.message);
    }
    const row = data as WorkoutRow | null;
    if (!row?.execution) {
      throw new AppError("NOT_FOUND", "Workout not found");
    }

    const plan = buildWorkoutPlanFromExecution(row.id, row.title, row.execution);
    if (!plan) {
      throw new AppError("NOT_FOUND", "Workout has no schedulable structure");
    }

    return new Response(encode(plan), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${parsed.data}.workout"`,
      },
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

export default watchRoutes;
