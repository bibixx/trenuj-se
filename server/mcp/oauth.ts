import type { AppBindings } from "../lib/supabase";

function requireBinding(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`${key} is required for MCP OAuth metadata`);
  }
  return value;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getPublicAppUrl(bindings: AppBindings) {
  return trimTrailingSlash(requireBinding(bindings.PUBLIC_APP_URL, "PUBLIC_APP_URL"));
}

export function getSupabaseProjectUrl(bindings: AppBindings) {
  return trimTrailingSlash(requireBinding(bindings.VITE_SUPABASE_URL ?? bindings.SUPABASE_URL, "VITE_SUPABASE_URL or SUPABASE_URL"));
}

export function getUpstreamAuthorizationServerIssuer(bindings: AppBindings) {
  return `${getSupabaseProjectUrl(bindings)}/auth/v1`;
}

export function getAuthorizationServerIssuer(bindings: AppBindings) {
  return getPublicAppUrl(bindings);
}

export function getProtectedResourceMetadataUrl(bindings: AppBindings, resourcePath = "/mcp") {
  const normalizedPath = resourcePath.replace(/^\//, "").replace(/\/+$/, "");
  return `${getPublicAppUrl(bindings)}/.well-known/oauth-protected-resource/${normalizedPath}`;
}

export function buildProtectedResourceMetadata(bindings: AppBindings, resourcePath = "/mcp") {
  const normalizedPath = `/${resourcePath.replace(/^\//, "").replace(/\/+$/, "")}`;

  return {
    resource: `${getPublicAppUrl(bindings)}${normalizedPath}`,
    authorization_servers: [getAuthorizationServerIssuer(bindings)],
    bearer_methods_supported: ["header"],
    resource_name: "Workout Planner MCP",
  };
}

export function rewriteAuthorizationServerMetadata(bindings: AppBindings, upstream: Record<string, unknown>) {
  const issuer = getAuthorizationServerIssuer(bindings);

  return {
    ...upstream,
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
  };
}
