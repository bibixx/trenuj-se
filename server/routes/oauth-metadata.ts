import { Hono } from "hono";
import type { AppBindings } from "../lib/supabase";

const oauthMetadataRoutes = new Hono<{ Bindings: AppBindings }>();

oauthMetadataRoutes.get("/", (c) => {
  const supabaseUrl = c.env.VITE_SUPABASE_URL;
  const issuer = `${supabaseUrl}/auth/v1`;

  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
  });
});

export default oauthMetadataRoutes;
