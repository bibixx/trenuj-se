import { describe, expect, test } from "vitest";
import { buildPasswordResetRedirectUrl, isRateLimitError, parseRecoveryError, validateNewPassword } from "../../src/lib/password-reset.ts";

describe("buildPasswordResetRedirectUrl", () => {
  test("appends the confirm path to the origin", () => {
    expect(buildPasswordResetRedirectUrl("https://trenuj.se")).toBe("https://trenuj.se/reset-password/confirm");
  });
});

describe("validateNewPassword", () => {
  test("rejects passwords shorter than 6 characters", () => {
    expect(validateNewPassword("abc", "abc")).toBe("Password must be at least 6 characters");
  });

  test("rejects mismatched confirmation", () => {
    expect(validateNewPassword("secret123", "secret124")).toBe("Passwords don't match");
  });

  test("accepts a valid matching pair", () => {
    expect(validateNewPassword("secret123", "secret123")).toBeNull();
  });
});

describe("parseRecoveryError", () => {
  test("detects an expired link in the query string", () => {
    expect(parseRecoveryError("?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid", "")).toBe(
      "This password reset link is invalid or has expired.",
    );
  });

  test("detects an expired link in the hash fragment", () => {
    expect(parseRecoveryError("", "#error=access_denied&error_code=otp_expired")).toBe("This password reset link is invalid or has expired.");
  });

  test("returns the error description for other errors", () => {
    expect(parseRecoveryError("?error=server_error&error_description=Something+broke", "")).toBe("Something broke");
  });

  test("returns null for a clean landing", () => {
    expect(parseRecoveryError("?code=abc123", "")).toBeNull();
    expect(parseRecoveryError("", "")).toBeNull();
  });
});

describe("isRateLimitError", () => {
  test("recognises 429 responses", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ status: 400 })).toBe(false);
    expect(isRateLimitError({})).toBe(false);
  });
});
