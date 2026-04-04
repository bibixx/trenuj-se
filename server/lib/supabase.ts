import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";

export type AppBindings = {
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SECRET_KEY: string;
  DATABASE_URL?: string;
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_VERIFY_TOKEN?: string;
  STRAVA_WEBHOOK_PATH_SECRET?: string;
  PUBLIC_APP_URL?: string;
};

function getBinding<E extends { Bindings: AppBindings }>(c: Context<E>, key: keyof AppBindings): string | undefined {
  return c.env[key];
}

export function getSupabaseUrl<E extends { Bindings: AppBindings }>(c: Context<E>) {
  return getBinding(c, "VITE_SUPABASE_URL") ?? getBinding(c, "SUPABASE_URL");
}

export function createServerSupabase<E extends { Bindings: AppBindings }>(c: Context<E>) {
  const supabaseUrl = getSupabaseUrl(c);
  const supabaseSecretKey = getBinding(c, "SUPABASE_SECRET_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL binding");
  }

  if (!supabaseSecretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY binding");
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
