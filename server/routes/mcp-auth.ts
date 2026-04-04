import { Hono } from "hono";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase, type AppBindings } from "../lib/supabase";
import { hashToken } from "../mcp/context";

const tokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

type Variables = {
  user: User;
};

const mcpAuthRoutes = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `tp_${hex}`;
}

mcpAuthRoutes.use(async (c, next) => {
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

  c.set("user", data.user);
  await next();
});

mcpAuthRoutes.get("/", async (c) => {
  const supabase = createServerSupabase(c);
  const user = c.get("user");

  const { data, error } = await supabase.from("api_tokens").select("id, name, last_used_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false });

  if (error) {
    return c.json({ code: "INTERNAL_ERROR", message: error.message }, 500);
  }

  return c.json({ tokens: data });
});

mcpAuthRoutes.post("/", async (c) => {
  const supabase = createServerSupabase(c);
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = tokenCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid token payload",
        details: parsed.error.issues,
      },
      400,
    );
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);

  const { data, error } = await supabase
    .from("api_tokens")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      token_hash: tokenHash,
    })
    .select("id, name, last_used_at, created_at")
    .single();

  if (error || !data) {
    return c.json({ code: "INTERNAL_ERROR", message: error?.message ?? "Unknown error" }, 500);
  }

  return c.json({ token, record: data }, 201);
});

mcpAuthRoutes.delete("/:id", async (c) => {
  const supabase = createServerSupabase(c);
  const user = c.get("user");
  const id = c.req.param("id");

  const { error } = await supabase.from("api_tokens").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return c.json({ code: "INTERNAL_ERROR", message: error.message }, 500);
  }

  return c.body(null, 204);
});

export default mcpAuthRoutes;
