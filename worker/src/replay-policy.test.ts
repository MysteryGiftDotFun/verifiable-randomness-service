import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowLruReplayFallback,
  isProductionEnvironment,
  paidRngBlockReason,
  productionRequiresRedisReplay,
} from "./replay-policy.ts";

test("productionRequiresRedisReplay: APP_ENVIRONMENT=production", () => {
  assert.equal(
    productionRequiresRedisReplay({ APP_ENVIRONMENT: "production" }),
    true,
  );
});

test("productionRequiresRedisReplay: ENVIRONMENT=production (case-insensitive)", () => {
  assert.equal(
    productionRequiresRedisReplay({ ENVIRONMENT: "Production" }),
    true,
  );
});

test("productionRequiresRedisReplay: NODE_ENV=production", () => {
  assert.equal(productionRequiresRedisReplay({ NODE_ENV: "production" }), true);
});

test("production mode fails closed if any environment variable says production", () => {
  assert.equal(
    isProductionEnvironment({
      APP_ENVIRONMENT: "development",
      NODE_ENV: " Production ",
    }),
    true,
  );
});

test("productionRequiresRedisReplay: development does not require Redis", () => {
  assert.equal(
    productionRequiresRedisReplay({ APP_ENVIRONMENT: "development" }),
    false,
  );
  assert.equal(productionRequiresRedisReplay({ NODE_ENV: "development" }), false);
  assert.equal(productionRequiresRedisReplay({}), false);
});

test("prod + redis down → fail closed (no LRU)", () => {
  const env = { APP_ENVIRONMENT: "production" };
  const redisReady = false;
  assert.equal(productionRequiresRedisReplay(env), true);
  assert.equal(allowLruReplayFallback(env), false);
  assert.equal(productionRequiresRedisReplay(env) && !redisReady, true);
});

test("prod + redis up → ok (no fail-closed)", () => {
  const env = { APP_ENVIRONMENT: "production" };
  const redisReady = true;
  assert.equal(productionRequiresRedisReplay(env), true);
  assert.equal(productionRequiresRedisReplay(env) && !redisReady, false);
});

test("dev + redis down → allow LRU", () => {
  const env = { APP_ENVIRONMENT: "development" };
  const redisReady = false;
  assert.equal(allowLruReplayFallback(env), true);
  assert.equal(productionRequiresRedisReplay(env) && !redisReady, false);
});

test("production public paid RNG requests are blocked before x402 when Redis is down", () => {
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: true,
      internalService: false,
      redisReady: false,
      teeReady: true,
      env: { APP_ENVIRONMENT: "production" },
    }),
    "replay_backend_unavailable",
  );
});

test("production RNG requests are blocked before payment when TEE is unavailable", () => {
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: true,
      internalService: false,
      redisReady: true,
      teeReady: false,
      env: { NODE_ENV: "production" },
    }),
    "tee_unavailable",
  );
});

test("internal RNG calls bypass replay checks, but not a missing production TEE", () => {
  const env = { NODE_ENV: "production" };
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: true,
      internalService: true,
      redisReady: false,
      teeReady: true,
      env,
    }),
    null,
  );
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: false,
      internalService: false,
      redisReady: false,
      teeReady: false,
      env,
    }),
    null,
  );
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: true,
      internalService: false,
      redisReady: false,
      teeReady: true,
      env: { NODE_ENV: "development" },
    }),
    null,
  );
  assert.equal(
    paidRngBlockReason({
      isPaidRequest: true,
      internalService: true,
      redisReady: false,
      teeReady: false,
      env,
    }),
    "tee_unavailable",
  );
});
