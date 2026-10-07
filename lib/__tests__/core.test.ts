import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assertBalanced } from "../ledger";
import { calcFee, formatBDT, toPaisa } from "../money";
import { canTransition, dhakaDay, paymentFilter, successMismatch } from "../payments";
import { isProviderAllowed } from "../providers";
import { ipFrom } from "../rate-limit";
import { settlementCutoff, summarize } from "../settlement";
import { base32, hotp, openSecret, sealSecret, verifyTotp } from "../totp";
import { isPrivateIp, signWebhook } from "../webhooks";

test("money parsing and fee rounding", () => {
  assert.equal(toPaisa("123.45"), 12345);
  assert.equal(toPaisa("10.5"), 1050);
  assert.equal(toPaisa(500), 50000);
  assert.equal(toPaisa("1.234"), null);
  assert.equal(toPaisa("-5"), null);
  assert.equal(toPaisa("abc"), null);
  assert.equal(calcFee(10000, 185), 185); // 100 BDT @ 1.85%
  assert.equal(calcFee(2702, 185), 50); // 49.987 -> 50 (half-up)
  assert.equal(calcFee(2700, 185), 50); // 49.95 -> 50
  assert.equal(calcFee(2697, 185), 50); // 49.8945 -> 50
  assert.equal(calcFee(2675, 185), 49); // 49.4875 -> 49
  assert.equal(formatBDT(12345678), "৳1,23,456.78");
});

test("ledger rejects unbalanced or invalid postings", () => {
  assert.doesNotThrow(() => assertBalanced([{ account: "a", debit: 100 }, { account: "b", credit: 98 }, { account: "c", credit: 2 }]));
  assert.throws(() => assertBalanced([{ account: "a", debit: 100 }, { account: "b", credit: 99 }]));
  assert.throws(() => assertBalanced([{ account: "a", debit: 1.5 }, { account: "b", credit: 1.5 }]));
  assert.throws(() => assertBalanced([{ account: "a", debit: -5 }, { account: "b", credit: -5 }]));
  assert.throws(() => assertBalanced([]));
});

test("payment state machine", () => {
  assert.ok(canTransition("CREATED", "PENDING"));
  assert.ok(canTransition("PENDING", "SUCCEEDED"));
  assert.ok(canTransition("SUCCEEDED", "PARTIALLY_REFUNDED"));
  assert.ok(canTransition("PARTIALLY_REFUNDED", "REFUNDED"));
  // A duplicate success callback cannot book the payment twice.
  assert.ok(!canTransition("SUCCEEDED", "SUCCEEDED"));
  assert.ok(!canTransition("CREATED", "SUCCEEDED"));
  assert.ok(!canTransition("FAILED", "SUCCEEDED"));
  assert.ok(!canTransition("REFUNDED", "PARTIALLY_REFUNDED"));
});

test("settlement net and T+1 cutoff (Asia/Dhaka)", () => {
  assert.deepEqual(summarize([{ amount: 10000, fee: 185 }, { amount: 5000, fee: 115 }], [{ amount: 2000 }]), {
    gross: 15000,
    fees: 300,
    refunds: 2000,
    net: 12700,
  });
  // 2026-10-06 03:00 Dhaka (= 05 21:00 UTC) -> cutoff is 2026-10-06 00:00 Dhaka = 2026-10-05T18:00Z
  assert.equal(settlementCutoff(new Date("2026-10-05T21:00:00Z")).toISOString(), "2026-10-05T18:00:00.000Z");
  // 2026-10-05 23:59 Dhaka -> cutoff is 2026-10-05 00:00 Dhaka
  assert.equal(settlementCutoff(new Date("2026-10-05T17:59:00Z")).toISOString(), "2026-10-04T18:00:00.000Z");
});

test("webhook signature is HMAC-SHA256 over `${t}.${body}`", () => {
  const expected = createHmac("sha256", "secret").update('1700000000.{"a":1}').digest("hex");
  assert.equal(signWebhook("secret", '{"a":1}', 1700000000), `t=1700000000,v1=${expected}`);
});

test("sandbox money never mixes with live money", () => {
  assert.ok(isProviderAllowed(true, "TEST", true));
  assert.ok(!isProviderAllowed(false, "TEST", true)); // test payment on a real gateway
  assert.ok(isProviderAllowed(false, "LIVE", true));
  assert.ok(!isProviderAllowed(true, "LIVE", true)); // mock/sandbox "success" booked as real money
  assert.ok(isProviderAllowed(true, "LIVE", false)); // allowed only outside production, for demos
});

test("provider success is only booked on an exact match", () => {
  const p = { id: "pay_1", amount: 10000, currency: "BDT" };
  assert.equal(successMismatch(p, { status: "SUCCEEDED", amount: 10000, currency: "BDT", reference: "pay_1" }), null);
  assert.equal(successMismatch(p, { status: "SUCCEEDED", amount: 10000 }), null);
  assert.match(successMismatch(p, { status: "SUCCEEDED" })!, /amount/);
  assert.match(successMismatch(p, { status: "SUCCEEDED", amount: 100 })!, /amount/);
  assert.match(successMismatch(p, { status: "SUCCEEDED", amount: 10000, currency: "USD" })!, /currency/);
  assert.match(successMismatch(p, { status: "SUCCEEDED", amount: 10000, reference: "pay_2" })!, /reference/);
});

test("webhook SSRF guard and client IP parsing", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
    assert.ok(isPrivateIp(ip), ip);
  }
  for (const ip of ["8.8.8.8", "103.4.145.2", "2606:4700::1111"]) assert.ok(!isPrivateIp(ip), ip);
  const h = (o: Record<string, string>) => (n: string) => o[n];
  assert.equal(ipFrom(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(ipFrom(h({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" })), "5.5.5.5"); // first hop is client-controlled
  assert.equal(ipFrom(h({})), "127.0.0.1");
});

test("TOTP matches RFC 6238 and rejects replays", () => {
  const key = Buffer.from("12345678901234567890");
  assert.equal(base32(key), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(hotp(key, 1), "287082"); // RFC 6238 vector at T=59s (8-digit 94287082)
  assert.equal(hotp(key, 37037036), "081804"); // T=1111111109
  const now = 59_000;
  assert.equal(verifyTotp(key, "287082", 0, now), 1);
  assert.equal(verifyTotp(key, "287082", 1, now), null); // same code twice
  assert.equal(verifyTotp(key, "287082", 0, now + 30_000), 1); // one step of clock drift
  assert.equal(verifyTotp(key, "287082", 0, now + 90_000), null); // too old
  assert.equal(verifyTotp(key, "28708", 0, now), null);
  process.env.NEXTAUTH_SECRET ??= "x".repeat(32);
  const sealed = sealSecret(key);
  assert.deepEqual(openSecret(sealed), key);
  assert.throws(() => openSecret(sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA"))); // tampered
});

test("payment search filters", () => {
  assert.equal(dhakaDay("2026-10-07")?.toISOString(), "2026-10-06T18:00:00.000Z");
  assert.equal(dhakaDay("2026-10-07", true)?.toISOString(), "2026-10-07T17:59:59.999Z");
  for (const bad of ["2026-02-31", "2026-13-01", "07-10-2026", "", undefined]) assert.equal(dhakaDay(bad), undefined, bad);
  const f = paymentFilter("m1", true, { status: "SUCCEEDED", mode: "test", q: "  0171  ", from: "2026-10-01", to: "nope" });
  assert.equal(f.mode, "TEST");
  assert.equal(f.status, "SUCCEEDED");
  assert.equal(f.q, "0171");
  assert.deepEqual([f.from, f.to], ["2026-10-01", undefined]);
  assert.equal(f.where.merchantId, "m1");
  assert.equal(paymentFilter("m1", true, { status: "BOGUS" }).status, undefined);
  assert.equal(paymentFilter("m1", false, {}).mode, "TEST");
});