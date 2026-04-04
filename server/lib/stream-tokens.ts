import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, hashToken } from "../mcp/context";

export async function generateStreamToken(supabase: SupabaseClient, userId: string, activityStravaId: number) {
  await supabase.from("stream_tokens").delete().lt("expires_at", new Date().toISOString());

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase.from("stream_tokens").insert({
    user_id: userId,
    activity_strava_id: activityStravaId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  return token;
}

export async function consumeStreamToken(supabase: SupabaseClient, rawToken: string, activityStravaId: number) {
  const tokenHash = await hashToken(rawToken);
  const { data, error } = await supabase.from("stream_tokens").select("id, user_id, activity_strava_id, expires_at").eq("token_hash", tokenHash).maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data) {
    throw new AppError("AUTH_ERROR", "Invalid or expired stream token");
  }

  if (data.activity_strava_id !== activityStravaId) {
    throw new AppError("AUTH_ERROR", "Invalid or expired stream token");
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("stream_tokens").delete().eq("id", data.id);
    throw new AppError("AUTH_ERROR", "Invalid or expired stream token");
  }

  await supabase.from("stream_tokens").delete().eq("id", data.id);
  return data.user_id as string;
}
