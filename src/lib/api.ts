import { supabase } from "./supabase.ts";

/**
 * Fetch wrapper for server HTTP routes that need Supabase session JWT auth.
 * Automatically attaches the Authorization header.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = (body as Record<string, unknown>)?.message ?? response.statusText;
    throw new Error(String(message));
  }

  return response;
}
