const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * A long-lived, stateless token the iOS companion stores once and sends to fetch its
 * owner's workout feed. Format: `<userId>.<hmac(userId)>`. The userId is readable (it is
 * not secret); the HMAC makes it unforgeable. Stateless — no table, no expiry. To revoke
 * every issued token, rotate WATCH_TOKEN_SECRET.
 */
export async function createWatchToken(secret: string, userId: string): Promise<string> {
  const signature = await hmacHex(secret, userId);
  return `${userId}.${signature}`;
}

/** Returns the userId when the token's signature is valid, otherwise null. */
export async function verifyWatchToken(secret: string, token: string): Promise<string | null> {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmacHex(secret, userId);

  return timingSafeEqual(signature, expected) ? userId : null;
}
