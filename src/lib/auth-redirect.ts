export interface AuthRouteSearch {
  email?: string;
  returnTo?: string;
}

export function sanitizeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return undefined;
  }

  return trimmed;
}

export function getPostAuthRedirect(value: unknown): string {
  return sanitizeReturnTo(value) ?? "/";
}

export function buildReturnTo(pathname: string, search = "", hash = ""): string {
  return `${pathname}${search}${hash}`;
}

export function parseAuthRouteSearch(search: Record<string, unknown>): AuthRouteSearch {
  const email = typeof search.email === "string" && search.email.length > 0 ? search.email : undefined;

  return {
    email,
    returnTo: sanitizeReturnTo(search.returnTo),
  };
}
