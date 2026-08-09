import { supabase } from "./supabase.ts";

/** Error thrown by apiFetch for non-2xx responses, carrying the server's error code. */
export class ApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const message = body?.message ?? response.statusText;
    const code = typeof body?.code === "string" ? body.code : undefined;
    throw new ApiError(String(message), response.status, code);
  }

  return response;
}
