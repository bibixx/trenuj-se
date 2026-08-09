/** Absolute URL the password-reset email should land on. */
export function buildPasswordResetRedirectUrl(origin: string): string {
  return `${origin}/reset-password/confirm`;
}

/** Client-side validation for the new-password form. Returns an error message or null. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < 6) {
    return "Password must be at least 6 characters";
  }
  if (password !== confirm) {
    return "Passwords don't match";
  }
  return null;
}

const EXPIRED_MESSAGE = "This password reset link is invalid or has expired.";

/**
 * Detects a failed recovery link. Supabase appends error params to either the
 * query string or the hash fragment depending on the flow.
 */
export function parseRecoveryError(search: string, hash: string): string | null {
  for (const raw of [search, hash]) {
    const params = new URLSearchParams(raw.replace(/^[?#]/, ""));
    const errorCode = params.get("error_code");
    const error = params.get("error");
    if (errorCode === "otp_expired" || error === "access_denied") {
      return EXPIRED_MESSAGE;
    }
    if (error) {
      return params.get("error_description") ?? EXPIRED_MESSAGE;
    }
  }
  return null;
}

export function isRateLimitError(error: { status?: number }): boolean {
  return error.status === 429;
}
