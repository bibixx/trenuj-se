import { queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase.ts";
import type { Profile } from "../types.ts";

export const profileKeys = {
  current: ["profile"] as const,
};

async function fetchProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("id, strava_athlete_id, is_premium, created_at, updated_at").eq("id", user.id).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    stravaAthleteId: (data.strava_athlete_id as number) ?? null,
    isPremium: (data.is_premium as boolean) ?? false,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export const profileQueryOptions = queryOptions({
  queryKey: profileKeys.current,
  queryFn: fetchProfile,
});
