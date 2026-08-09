import { describe, expect, test } from "vitest";
import { friendlyAuthError } from "../../src/lib/auth-errors.ts";

describe("friendlyAuthError", () => {
  test("maps known error codes to friendly copy", () => {
    expect(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("Incorrect email or password. Please check and try again.");
    expect(friendlyAuthError({ code: "user_already_exists", message: "User already registered" })).toBe("An account with this email already exists. Try signing in instead.");
    expect(friendlyAuthError({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe(
      "Your email address hasn't been confirmed yet. Check your inbox for the confirmation link.",
    );
  });

  test("falls back to message matching when code is absent", () => {
    expect(friendlyAuthError({ message: "Invalid login credentials" })).toBe("Incorrect email or password. Please check and try again.");
  });

  test("returns the raw message for unknown errors", () => {
    expect(friendlyAuthError({ code: "weak_password", message: "Password should contain at least one symbol." })).toBe("Password should contain at least one symbol.");
    expect(friendlyAuthError({ message: "Something unexpected" })).toBe("Something unexpected");
  });
});
