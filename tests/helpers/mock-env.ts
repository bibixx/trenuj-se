import type { AppBindings } from "../../server/lib/supabase.ts";

export const MOCK_ENV: AppBindings = {
  VITE_SUPABASE_URL: "http://mock.supabase.local",
  SUPABASE_SECRET_KEY: "mock-secret-key",
  STRAVA_CLIENT_ID: "mock-strava-id",
  STRAVA_CLIENT_SECRET: "mock-strava-secret",
  STRAVA_VERIFY_TOKEN: "mock-verify-token",
  STRAVA_WEBHOOK_PATH_SECRET: "mock-webhook-secret",
  STRAVA_WEBHOOK_SIGNING_SECRET: "mock-signing-secret",
  PUBLIC_APP_URL: "http://localhost:8787",
};

export const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";
export const MOCK_PLAN_ID = "00000000-0000-0000-0000-000000000010";
export const MOCK_PHASE_ID = "00000000-0000-0000-0000-000000000020";
export const MOCK_WORKOUT_ID = "00000000-0000-0000-0000-000000000030";
export const MOCK_ACTIVITY_ID = "00000000-0000-0000-0000-000000000040";
export const MOCK_TOKEN_ID = "00000000-0000-0000-0000-000000000050";
export const MOCK_NOTE_ID = "00000000-0000-0000-0000-000000000060";
