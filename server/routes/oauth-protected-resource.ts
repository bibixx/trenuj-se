import { Hono } from "hono";
import type { AppBindings } from "../lib/supabase";
import { buildProtectedResourceMetadata } from "../mcp/oauth";

const oauthProtectedResourceRoutes = new Hono<{ Bindings: AppBindings }>();

oauthProtectedResourceRoutes.get("/mcp", (c) => c.json(buildProtectedResourceMetadata(c.env, "/mcp")));
oauthProtectedResourceRoutes.get("/mcp/", (c) => c.json(buildProtectedResourceMetadata(c.env, "/mcp")));
oauthProtectedResourceRoutes.get("/mcp2", (c) => c.json(buildProtectedResourceMetadata(c.env, "/mcp2")));
oauthProtectedResourceRoutes.get("/mcp2/", (c) => c.json(buildProtectedResourceMetadata(c.env, "/mcp2")));

export default oauthProtectedResourceRoutes;
