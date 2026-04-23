import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { z, ZodError } from "zod";
import { createServerSupabase, type AppBindings } from "../lib/supabase";
import { createMcpConnectorToken, listMcpConnectorTokens, revokeMcpConnectorToken } from "../lib/mcp-connector-tokens";
import { AppError } from "../mcp/context";

type Variables = {
  userId: string;
};

const createConnectorTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const connectorTokenIdParamSchema = z.object({
  tokenId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
});

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

function jsonError(c: Context<{ Bindings: AppBindings; Variables: Variables }>, error: unknown) {
  if (error instanceof AppError) {
    const status =
      error.code === "AUTH_ERROR"
        ? 401
        : error.code === "VALIDATION_ERROR"
          ? 400
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : error.code === "RATE_LIMITED"
                ? 429
                : 500;

    return c.json({ code: error.code, message: error.message }, status);
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues,
      },
      400,
    );
  }

  if (error instanceof Error) {
    return c.json({ code: "INTERNAL_ERROR", message: error.message }, 500);
  }

  return c.json({ code: "INTERNAL_ERROR", message: "Unknown error" }, 500);
}

const connectorTokenRoutes = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

connectorTokenRoutes.use("*", requireUser);

connectorTokenRoutes.get("/", async (c) => {
  try {
    const supabase = createServerSupabase(c);
    const userId = c.get("userId");
    const tokens = await listMcpConnectorTokens(supabase, userId);

    return c.json({ tokens });
  } catch (error) {
    return jsonError(c, error);
  }
});

connectorTokenRoutes.post("/", async (c) => {
  try {
    const supabase = createServerSupabase(c);
    const userId = c.get("userId");
    const body = createConnectorTokenBodySchema.parse(await c.req.json());
    const result = await createMcpConnectorToken(supabase, c.env, userId, body.name);

    return c.json(result, 201);
  } catch (error) {
    return jsonError(c, error);
  }
});

connectorTokenRoutes.delete("/:tokenId", async (c) => {
  try {
    const supabase = createServerSupabase(c);
    const userId = c.get("userId");
    const params = connectorTokenIdParamSchema.parse({ tokenId: c.req.param("tokenId") });
    const token = await revokeMcpConnectorToken(supabase, userId, params.tokenId);

    return c.json({ token });
  } catch (error) {
    return jsonError(c, error);
  }
});

export default connectorTokenRoutes;
