import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, hashToken } from "../mcp/context";
import { generateRawToken } from "./mcp-connector-tokens";

type WatchTokenRow = {
  id: string;
  user_id: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type WatchTokenSummary = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function mapWatchToken(row: WatchTokenRow): WatchTokenSummary {
  return {
    id: row.id,
    name: row.name,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export async function listWatchTokens(supabase: SupabaseClient, userId: string): Promise<WatchTokenSummary[]> {
  const { data, error } = await supabase
    .from("watch_tokens")
    .select("id, user_id, name, last_used_at, revoked_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  return ((data as WatchTokenRow[] | null) ?? []).map(mapWatchToken);
}

export async function createWatchToken(supabase: SupabaseClient, userId: string, name: string) {
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);

  const { data, error } = await supabase
    .from("watch_tokens")
    .insert({
      user_id: userId,
      name,
      token_hash: tokenHash,
    })
    .select("id, user_id, name, last_used_at, revoked_at, created_at")
    .single();

  if (error || !data) {
    throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to create watch token");
  }

  return {
    token: mapWatchToken(data as WatchTokenRow),
    rawToken,
  };
}

export async function revokeWatchToken(supabase: SupabaseClient, userId: string, tokenId: string): Promise<WatchTokenSummary> {
  const { data, error } = await supabase
    .from("watch_tokens")
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
    throw new AppError("NOT_FOUND", "Watch token not found");
  }

  return mapWatchToken(data as WatchTokenRow);
}

/** Resolves a raw watch token to its owner's userId, or throws AUTH_ERROR. */
export async function authenticateWatchToken(supabase: SupabaseClient, rawToken: string): Promise<string> {
  const tokenHash = await hashToken(rawToken);
  const { data, error } = await supabase.from("watch_tokens").select("id, user_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data || typeof data.user_id !== "string" || typeof data.id !== "string") {
    throw new AppError("AUTH_ERROR", "Invalid or revoked watch token");
  }

  const { error: touchError } = await supabase.from("watch_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  if (touchError) {
    throw new AppError("INTERNAL_ERROR", touchError.message);
  }

  return data.user_id;
}
