import { Hono } from "hono";
import type { AppBindings } from "../lib/supabase";

const oauthMetadataRoutes = new Hono<{ Bindings: AppBindings }>();

oauthMetadataRoutes.get("/", async (c) => {
  const supabaseUrl = c.env.VITE_SUPABASE_URL;

  // Proxy Supabase's actual discovery document so values stay in sync
  const response = await fetch(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`);

  if (!response.ok) {
    return c.json({ error: "Failed to fetch OAuth metadata" }, 502);
  }

  const metadata = await response.json();
  return c.json(metadata);
});

export default oauthMetadataRoutes;
