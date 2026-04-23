import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, hashToken } from "../mcp/context";
import type { AppBindings } from "./supabase";

type McpConnectorTokenRow = {
  id: string;
  user_id: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type McpConnectorTokenSummary = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function requirePublicAppUrl(bindings: AppBindings) {
  if (!bindings.PUBLIC_APP_URL) {
    throw new AppError("INTERNAL_ERROR", "PUBLIC_APP_URL is required to build Claude MCP URLs");
  }

  return trimTrailingSlash(bindings.PUBLIC_APP_URL);
}

function mapConnectorToken(row: McpConnectorTokenRow): McpConnectorTokenSummary {
  return {
    id: row.id,
    name: row.name,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

function generateRawToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildClaudeMcpUrl(bindings: AppBindings, rawToken: string) {
  return `${requirePublicAppUrl(bindings)}/mcp/claude/${encodeURIComponent(rawToken)}`;
}

export async function listMcpConnectorTokens(supabase: SupabaseClient, userId: string): Promise<McpConnectorTokenSummary[]> {
  const { data, error } = await supabase
    .from("mcp_connector_tokens")
    .select("id, user_id, name, last_used_at, revoked_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  return ((data as McpConnectorTokenRow[] | null) ?? []).map(mapConnectorToken);
}

export async function createMcpConnectorToken(supabase: SupabaseClient, bindings: AppBindings, userId: string, name: string) {
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);

  const { data, error } = await supabase
    .from("mcp_connector_tokens")
    .insert({
      user_id: userId,
      name,
      token_hash: tokenHash,
    })
    .select("id, user_id, name, last_used_at, revoked_at, created_at")
    .single();

  if (error || !data) {
    throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to create connector token");
  }

  return {
    token: mapConnectorToken(data as McpConnectorTokenRow),
    rawToken,
    connectorUrl: buildClaudeMcpUrl(bindings, rawToken),
  };
}

export async function revokeMcpConnectorToken(supabase: SupabaseClient, userId: string, tokenId: string): Promise<McpConnectorTokenSummary> {
  const { data, error } = await supabase
    .from("mcp_connector_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id, user_id, name, last_used_at, revoked_at, created_at")
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data) {
    throw new AppError("NOT_FOUND", "Connector token not found");
  }

  return mapConnectorToken(data as McpConnectorTokenRow);
}

export async function authenticateMcpConnectorToken(supabase: SupabaseClient, rawToken: string) {
  const tokenHash = await hashToken(rawToken);
  const { data, error } = await supabase.from("mcp_connector_tokens").select("id, user_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data || typeof data.user_id !== "string" || typeof data.id !== "string") {
    throw new AppError("AUTH_ERROR", "Invalid or revoked connector token");
  }

  const { error: touchError } = await supabase.from("mcp_connector_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  if (touchError) {
    throw new AppError("INTERNAL_ERROR", touchError.message);
  }

  return data.user_id;
}
