import { describe, expect, test } from "vitest";
import { MAX_SKEW_SECONDS, signBody, verifyBody } from "./lib/hmac";

const SECRET = "test-secret";
const NOW = 1_800_000_000;

describe("HMAC request signing", () => {
  test("accepts a correctly signed body", async () => {
    const body = JSON.stringify({ loanId: "abc", status: "approved" });
    const { timestamp, signature } = await signBody(SECRET, body, NOW);
    expect(await verifyBody(SECRET, { body, timestamp, signature }, NOW)).toEqual({ ok: true });
  });

  test("matches a known vector, so n8n's Node crypto agrees with Web Crypto", async () => {
    // node -e "console.log(require('crypto').createHmac('sha256','test-secret').update('1800000000.hello').digest('hex'))"
    const { signature } = await signBody(SECRET, "hello", NOW);
    expect(signature).toBe("cf95252f63f57ad0638a79d05583baff96bcaa9b5beaae7538373624937909f9");
  });

  test("rejects a tampered body", async () => {
    const { timestamp, signature } = await signBody(SECRET, '{"status":"approved"}', NOW);
    const result = await verifyBody(SECRET, { body: '{"status":"declined"}', timestamp, signature }, NOW);
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  test("rejects the wrong secret", async () => {
    const body = "{}";
    const { timestamp, signature } = await signBody("other-secret", body, NOW);
    expect(await verifyBody(SECRET, { body, timestamp, signature }, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  test("rejects replays outside the time window", async () => {
    const body = "{}";
    const { timestamp, signature } = await signBody(SECRET, body, NOW);
    const later = NOW + MAX_SKEW_SECONDS + 1;
    expect(await verifyBody(SECRET, { body, timestamp, signature }, later)).toEqual({ ok: false, reason: "stale" });
  });

  test("rejects missing headers", async () => {
    expect(await verifyBody(SECRET, { body: "{}", timestamp: null, signature: null }, NOW)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});
