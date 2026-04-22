import { Hono } from "hono";
import oauthMetadataRoutes from "./routes/oauth-metadata";
import oauthProtectedResourceRoutes from "./routes/oauth-protected-resource";
import oauthProxyRoutes from "./routes/oauth-proxy";
import shareRoutes from "./routes/shares";
import stravaRoutes from "./routes/strava";
import type { AppBindings } from "./lib/supabase";
import { handleMcpRequest } from "./mcp/handler";

const app = new Hono<{ Bindings: AppBindings }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/.well-known/oauth-authorization-server", oauthMetadataRoutes);
app.route("/.well-known/openid-configuration", oauthMetadataRoutes);
app.route("/.well-known/oauth-protected-resource", oauthProtectedResourceRoutes);
app.route("/", oauthProxyRoutes);
app.route("/api/shares", shareRoutes);
app.route("/api/strava", stravaRoutes);
app.all("/mcp", handleMcpRequest);
app.all("/mcp/", handleMcpRequest);
app.all("/mcp2", handleMcpRequest);
app.all("/mcp2/", handleMcpRequest);

export default app;
