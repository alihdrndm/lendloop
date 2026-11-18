// HMAC-SHA256 request signing shared by every call between Convex and n8n.
//
//   signature = hex(HMAC_SHA256(secret, `${timestamp}.${body}`))
//
// `body` is the exact string sent on the wire, and `timestamp` is unix
// seconds. The receiver rejects anything older than MAX_SKEW_SECONDS, so a
// captured request can't be replayed later. Uses Web Crypto, which is
// available in the Convex runtime and in Node.

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison, so timing doesn't leak how much matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signBody(
  secret: string,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = String(nowSeconds);
  return { timestamp, signature: await hmacHex(secret, `${timestamp}.${body}`) };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export async function verifyBody(
  secret: string,
  input: { body: string; timestamp: string | null; signature: string | null },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!secret || !input.timestamp || !input.signature) return { ok: false, reason: "missing" };
  const ts = Number(input.timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = await hmacHex(secret, `${input.timestamp}.${input.body}`);
  return safeEqual(expected, input.signature.toLowerCase()) ? { ok: true } : { ok: false, reason: "mismatch" };
}
