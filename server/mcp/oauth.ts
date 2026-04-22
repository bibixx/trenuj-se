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

export function getAuthorizationServerIssuer(bindings: AppBindings) {
  return `${trimTrailingSlash(requireBinding(bindings.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"))}/auth/v1`;
}

export function getProtectedResourceMetadataUrl(bindings: AppBindings, resourcePath = "/mcp") {
  const normalizedPath = resourcePath.replace(/^\//, "").replace(/\/+$/, "");
  return `${trimTrailingSlash(requireBinding(bindings.PUBLIC_APP_URL, "PUBLIC_APP_URL"))}/.well-known/oauth-protected-resource/${normalizedPath}`;
}

export function buildProtectedResourceMetadata(bindings: AppBindings, resourcePath = "/mcp") {
  const baseUrl = trimTrailingSlash(requireBinding(bindings.PUBLIC_APP_URL, "PUBLIC_APP_URL"));
  const normalizedPath = `/${resourcePath.replace(/^\//, "").replace(/\/+$/, "")}`;

  return {
    resource: `${baseUrl}${normalizedPath}`,
    authorization_servers: [getAuthorizationServerIssuer(bindings)],
    bearer_methods_supported: ["header"],
    resource_name: "Workout Planner MCP",
  };
}
