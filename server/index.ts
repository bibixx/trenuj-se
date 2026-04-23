import { Hono } from "hono";
import oauthMetadataRoutes from "./routes/oauth-metadata";
import oauthProtectedResourceRoutes from "./routes/oauth-protected-resource";
import mcpConnectorTokenRoutes from "./routes/mcp-connector-tokens";
import shareRoutes from "./routes/shares";
import stravaRoutes from "./routes/strava";
import type { AppBindings } from "./lib/supabase";
import { handleClaudeMcpRequest, handleMcpRequest } from "./mcp/handler";

const app = new Hono<{ Bindings: AppBindings }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/.well-known/oauth-authorization-server", oauthMetadataRoutes);
app.route("/.well-known/oauth-protected-resource", oauthProtectedResourceRoutes);
app.route("/api/mcp/connector-tokens", mcpConnectorTokenRoutes);
app.route("/api/shares", shareRoutes);
app.route("/api/strava", stravaRoutes);
app.all("/mcp", handleMcpRequest);
app.all("/mcp/", handleMcpRequest);
app.all("/mcp/claude/:connectorToken", handleClaudeMcpRequest);
app.all("/mcp/claude/:connectorToken/", handleClaudeMcpRequest);

export default app;
