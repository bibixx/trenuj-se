import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { createServerSupabase, type AppBindings } from "../lib/supabase";
import { AppError, errorPayload } from "../mcp/context";
import { autoMatchActivityToWorkout, getStravaOauthConfig, getStravaVerifyToken, getValidStravaAccessToken, stravaFetch, upsertStravaActivity } from "../lib/strava";
import { consumeStreamToken } from "../lib/stream-tokens";

type Variables = {
  userId: string;
};

const syncBodySchema = z.object({ days: z.number().int().min(1).max(90).default(30).optional() });

const requireUser: MiddlewareHandler<{ Bindings: AppBindings; Variables: Variables }> = async (c, next) => {
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

function sanitizePostAuthRedirect(raw: string | null | undefined) {
  const fallback = "/settings?strava=connected";

  if (!raw) {
    return fallback;
  }

  if (!raw.startsWith("/")) {
    return fallback;
  }

  if (raw.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(raw, "http://localhost");
    if (url.origin !== "http://localhost") {
      return fallback;
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/api" || url.pathname === "/mcp") {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

const stravaRoutes = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

stravaRoutes.use("/profile", requireUser);
stravaRoutes.use("/auth", requireUser);
stravaRoutes.use("/disconnect", requireUser);
stravaRoutes.use("/sync", requireUser);

stravaRoutes.get("/profile", async (c) => {
  const userId = c.get("userId");
  const supabase = createServerSupabase(c);

  const [{ data: profile, error: profileError }, { data: activePlan, error: planError }] = await Promise.all([
    supabase.from("profiles").select("id, strava_athlete_id, created_at, updated_at").eq("id", userId).maybeSingle(),
    supabase.from("plans").select("id, name, status, start_date, end_date").eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);

  if (profileError || planError || !profile) {
    return c.json({ code: "INTERNAL_ERROR", message: profileError?.message ?? planError?.message ?? "Failed to load profile" }, 500);
  }

  return c.json({ profile, stravaConnected: Boolean(profile.strava_athlete_id), activePlan });
});

stravaRoutes.get("/auth", async (c) => {
  const userId = c.get("userId");
  const config = getStravaOauthConfig(c.env);
  const state = crypto.randomUUID();
  const callback = sanitizePostAuthRedirect(c.req.query("callback"));
  setCookie(c, "strava_oauth_state", JSON.stringify({ state, userId }), {
    httpOnly: true,
    secure: config.publicAppUrl.startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", `${config.publicAppUrl}/api/strava/callback`);
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("scope", "activity:read_all");
  authorizeUrl.searchParams.set("state", `${state}:${encodeURIComponent(callback)}`);

  return c.redirect(authorizeUrl.toString(), 302);
});

stravaRoutes.get("/callback", async (c) => {
  try {
    const config = getStravaOauthConfig(c.env);
    const queryState = c.req.query("state");
    const cookieRaw = getCookie(c, "strava_oauth_state");
    const code = c.req.query("code");

    if (!queryState || !cookieRaw || !code) {
      throw new AppError("AUTH_ERROR", "Missing Strava OAuth callback parameters");
    }

    let cookieParsed: { state: string; userId: string };
    try {
      cookieParsed = JSON.parse(cookieRaw);
    } catch {
      throw new AppError("AUTH_ERROR", "Invalid Strava OAuth state cookie");
    }

    const [rawState, encodedCallback] = queryState.split(":");
    if (!rawState || rawState !== cookieParsed.state) {
      throw new AppError("AUTH_ERROR", "Invalid Strava OAuth state");
    }
    const userId = cookieParsed.userId;
    const callback = sanitizePostAuthRedirect(encodedCallback ? decodeURIComponent(encodedCallback) : undefined);

    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    const payload = (await tokenResponse.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_at?: number; athlete?: { id: number } } | null;
    if (!tokenResponse.ok || !payload?.access_token || !payload.refresh_token || !payload.expires_at || !payload.athlete?.id) {
      throw new AppError("INTERNAL_ERROR", "Failed to exchange Strava code", payload);
    }

    const supabase = createServerSupabase(c);
    const credentialRow = {
      user_id: userId,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_expires_at: new Date(payload.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: credentialError } = await supabase.from("strava_credentials").upsert(credentialRow, { onConflict: "user_id" });
    if (credentialError) throw new AppError("INTERNAL_ERROR", credentialError.message);

    const { error: profileError } = await supabase.from("profiles").update({ strava_athlete_id: payload.athlete.id }).eq("id", userId);
    if (profileError) throw new AppError("INTERNAL_ERROR", profileError.message);

    deleteCookie(c, "strava_oauth_state", { path: "/" });
    const successUrl = new URL(callback, config.publicAppUrl);
    if (!successUrl.searchParams.has("strava")) {
      successUrl.searchParams.set("strava", "connected");
    }
    return c.redirect(`${successUrl.pathname}${successUrl.search}${successUrl.hash}`, 302);
  } catch (error) {
    const payload = errorPayload(error);
    return c.redirect(`/settings?strava=error&message=${encodeURIComponent(payload.message)}`, 302);
  }
});

stravaRoutes.post("/disconnect", async (c) => {
  try {
    const userId = c.get("userId");
    const supabase = createServerSupabase(c);

    const { error: credentialsError } = await supabase.from("strava_credentials").delete().eq("user_id", userId);
    if (credentialsError) throw new AppError("INTERNAL_ERROR", credentialsError.message);

    const { error: profileError } = await supabase.from("profiles").update({ strava_athlete_id: null }).eq("id", userId);
    if (profileError) throw new AppError("INTERNAL_ERROR", profileError.message);

    return c.json({ ok: true });
  } catch (error) {
    const payload = errorPayload(error);
    const status = payload.code === "AUTH_ERROR" ? 401 : 500;
    return c.json(payload, status);
  }
});

stravaRoutes.get("/webhook/:secret", async (c) => {
  if (c.req.param("secret") !== c.env.STRAVA_WEBHOOK_PATH_SECRET) {
    return c.notFound();
  }

  try {
    const verifyToken = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    const expectedVerifyToken = getStravaVerifyToken(c.env);
    if (!verifyToken || verifyToken !== expectedVerifyToken || !challenge) {
      return c.json({ code: "AUTH_ERROR", message: "Invalid webhook verification token" }, 401);
    }
    return c.json({ "hub.challenge": challenge });
  } catch (error) {
    const payload = errorPayload(error);
    return c.json(payload, 500);
  }
});

stravaRoutes.post("/webhook/:secret", async (c) => {
  if (c.req.param("secret") !== c.env.STRAVA_WEBHOOK_PATH_SECRET) {
    return c.notFound();
  }

  try {
    const payload = await c.req.json();
    const eventSchema = z.object({
      object_type: z.string(),
      object_id: z.number(),
      aspect_type: z.enum(["create", "update", "delete"]),
      owner_id: z.number(),
      updates: z.record(z.string(), z.unknown()).optional(),
    });
    const event = eventSchema.parse(payload);

    const supabase = createServerSupabase(c);
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, strava_athlete_id").eq("strava_athlete_id", event.owner_id).maybeSingle();

    if (profileError) throw new AppError("INTERNAL_ERROR", profileError.message);
    if (!profile) {
      return c.json({ ok: true, ignored: true });
    }

    if (event.object_type === "athlete" && event.aspect_type === "update" && event.updates?.["authorized"] === "false") {
      await supabase.from("strava_credentials").delete().eq("user_id", profile.id);
      await supabase.from("profiles").update({ strava_athlete_id: null }).eq("id", profile.id);
      return c.json({ ok: true });
    }

    if (event.object_type !== "activity") {
      return c.json({ ok: true, ignored: true });
    }

    if (event.aspect_type === "delete") {
      await supabase.from("activities").delete().eq("strava_id", event.object_id).eq("user_id", profile.id);
      return c.json({ ok: true });
    }

    const detailedActivity = await stravaFetch<Record<string, unknown>>(supabase, c.env, profile.id, `/activities/${event.object_id}`);
    const activity = await upsertStravaActivity(supabase, profile.id, detailedActivity);
    await autoMatchActivityToWorkout(supabase, profile.id, activity);

    return c.json({ ok: true });
  } catch (error) {
    const payload = errorPayload(error);
    return c.json(payload, 500);
  }
});

stravaRoutes.post("/sync", async (c) => {
  try {
    const { days = 30 } = syncBodySchema.parse(await c.req.json().catch(() => ({})));
    const userId = c.get("userId");
    const supabase = createServerSupabase(c);
    const after = Math.floor((Date.now() - Math.min(days, 90) * 24 * 60 * 60 * 1000) / 1000);

    let page = 1;
    let synced = 0;
    const matched: string[] = [];
    while (page <= 3) {
      const activities = await stravaFetch<Array<Record<string, unknown>>>(supabase, c.env, userId, `/athlete/activities?after=${after}&page=${page}&per_page=100`);
      if (activities.length === 0) break;

      for (const detailed of activities) {
        const activity = await upsertStravaActivity(supabase, userId, detailed);
        const workout = await autoMatchActivityToWorkout(supabase, userId, activity);
        if (workout?.id) matched.push(workout.id);
        synced += 1;
      }

      if (activities.length < 100) break;
      page += 1;
    }

    return c.json({ ok: true, synced, matchedWorkouts: matched.length });
  } catch (error) {
    const payload = errorPayload(error);
    const status = payload.code === "AUTH_ERROR" ? 401 : 500;
    return c.json(payload, status);
  }
});

stravaRoutes.get("/streams/:stravaActivityId", async (c) => {
  try {
    const token = c.req.query("token");
    const stravaActivityId = Number(c.req.param("stravaActivityId"));
    if (!token || !Number.isFinite(stravaActivityId)) {
      throw new AppError("AUTH_ERROR", "Invalid or expired stream token");
    }

    const supabase = createServerSupabase(c);
    const userId = await consumeStreamToken(supabase, token, stravaActivityId);
    const accessToken = await getValidStravaAccessToken(supabase, c.env, userId);
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,grade_smooth&key_type=time`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AppError("INTERNAL_ERROR", "Failed to fetch activity streams", payload);
    }

    return c.json(payload);
  } catch (error) {
    const payload = errorPayload(error);
    const status = payload.code === "AUTH_ERROR" ? 401 : 500;
    return c.json(payload, status);
  }
});

export default stravaRoutes;
