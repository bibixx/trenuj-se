export async function computeStravaSignature(secret: string, t: number, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${rawBody}`));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildStravaSignatureHeader(args: { secret: string; rawBody: string; tSec?: number }): Promise<{ header: string; t: number }> {
  const t = args.tSec ?? Math.floor(Date.now() / 1000);
  const v1 = await computeStravaSignature(args.secret, t, args.rawBody);
  return { header: `t=${t},v1=${v1}`, t };
}
