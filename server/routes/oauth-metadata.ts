import { Hono } from "hono";
import type { AppBindings } from "../lib/supabase";
import { getSupabaseProjectUrl, rewriteAuthorizationServerMetadata } from "../mcp/oauth";

const oauthMetadataRoutes = new Hono<{ Bindings: AppBindings }>();

oauthMetadataRoutes.get("/", async (c) => {
  const response = await fetch(`${getSupabaseProjectUrl(c.env)}/.well-known/oauth-authorization-server/auth/v1`);

  if (!response.ok) {
    return c.json({ error: "Failed to fetch OAuth metadata" }, 502);
  }

  const metadata = (await response.json()) as Record<string, unknown>;
  return c.json(rewriteAuthorizationServerMetadata(c.env, metadata));
});

export default oauthMetadataRoutes;
