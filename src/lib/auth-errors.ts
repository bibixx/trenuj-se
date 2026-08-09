// Friendly copy for common Supabase auth errors; raw message as fallback.
const INVALID_CREDENTIALS = "Incorrect email or password. Please check and try again.";
const ALREADY_REGISTERED = "An account with this email already exists. Try signing in instead.";
const NOT_CONFIRMED = "Your email address hasn't been confirmed yet. Check your inbox for the confirmation link.";

const BY_CODE: Record<string, string> = {
  invalid_credentials: INVALID_CREDENTIALS,
  user_already_exists: ALREADY_REGISTERED,
  email_exists: ALREADY_REGISTERED,
  email_not_confirmed: NOT_CONFIRMED,
  over_email_send_rate_limit: "Too many attempts. Please wait a moment and try again.",
};

const BY_MESSAGE: Record<string, string> = {
  "Invalid login credentials": INVALID_CREDENTIALS,
  "User already registered": ALREADY_REGISTERED,
  "Email not confirmed": NOT_CONFIRMED,
};

export function friendlyAuthError(error: { code?: string; message: string }): string {
  return (error.code && BY_CODE[error.code]) || BY_MESSAGE[error.message] || error.message;
}
