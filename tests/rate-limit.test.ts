import { test } from "node:test";
import assert from "node:assert/strict";

import { LOGIN_LIMIT, MUTATION_LIMIT, clientIp, rateLimit } from "../src/lib/rate-limit";

test("a key is allowed exactly `limit` times, then blocked", () => {
  const key = `test-allow-${Math.random()}`;
  const opts = { limit: 3, windowMs: 60_000 };

  assert.deepEqual(
    [1, 2, 3].map(() => rateLimit(key, opts).ok),
    [true, true, true],
  );

  const blocked = rateLimit(key, opts);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter > 0, "a blocked caller must be told when to retry");
});

test("remaining counts down and never goes negative", () => {
  const key = `test-remaining-${Math.random()}`;
  const opts = { limit: 2, windowMs: 60_000 };

  assert.equal(rateLimit(key, opts).remaining, 1);
  assert.equal(rateLimit(key, opts).remaining, 0);
  assert.equal(rateLimit(key, opts).remaining, 0);
});

test("the window slides — old hits expire and free the bucket", () => {
  const key = `test-window-${Math.random()}`;
  // A 1 ms window means the previous hits are already outside it on the next call.
  const opts = { limit: 1, windowMs: 1 };

  assert.equal(rateLimit(key, opts).ok, true);
  const start = Date.now();
  while (Date.now() - start < 3) {
    /* spin past the window; sub-10ms so a sleep would be less accurate */
  }
  assert.equal(rateLimit(key, opts).ok, true, "bucket should have drained");
});

test("keys are isolated, so one attacker cannot lock out everyone", () => {
  const opts = { limit: 1, windowMs: 60_000 };
  const victim = `test-victim-${Math.random()}`;
  const attacker = `test-attacker-${Math.random()}`;

  assert.equal(rateLimit(attacker, opts).ok, true);
  assert.equal(rateLimit(attacker, opts).ok, false, "attacker is now blocked");
  assert.equal(rateLimit(victim, opts).ok, true, "a different key must be unaffected");
});

test("login is tighter than mutations, and both are sane", () => {
  // Login is the brute-force surface; mutations just need a runaway-script guard.
  assert.ok(LOGIN_LIMIT.limit <= 10, "login attempts must be tightly capped");
  assert.ok(LOGIN_LIMIT.windowMs >= 5 * 60_000, "login window must be minutes, not seconds");
  assert.ok(MUTATION_LIMIT.limit > LOGIN_LIMIT.limit, "editing must not be as restricted as login");
});

test("clientIp takes the first hop of x-forwarded-for and degrades safely", () => {
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" })),
    "203.0.113.9",
  );
  assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  // No proxy headers must still yield a usable bucket key, never undefined.
  assert.equal(clientIp(new Headers()), "unknown");
});
