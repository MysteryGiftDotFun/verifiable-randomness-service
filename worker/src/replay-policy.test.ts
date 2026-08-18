import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowLruReplayFallback,
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
