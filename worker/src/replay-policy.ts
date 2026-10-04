/**
 * Production must use Redis for payment replay claims (no LRU after restart).
 * Dev/test without Redis may fall through to the in-process LRU.
 */
export function productionRequiresRedisReplay(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isProductionEnvironment(env);
}

/** Security-sensitive production behavior must fail closed if any env says prod. */
export function isProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return [env.APP_ENVIRONMENT, env.ENVIRONMENT, env.NODE_ENV].some(
    (value) => value?.trim().toLowerCase() === "production",
  );
}

/** True when Redis is down and LRU fallthrough is allowed (non-production). */
export function allowLruReplayFallback(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !productionRequiresRedisReplay(env);
}

/** Block unavailable production RNG operations before x402 handles payment. */
export function paidRngBlockReason(args: {
  isPaidRequest: boolean;
  internalService: boolean;
  redisReady: boolean;
  teeReady: boolean;
  env?: NodeJS.ProcessEnv;
}): "tee_unavailable" | "replay_backend_unavailable" | null {
  if (!args.isPaidRequest || !productionRequiresRedisReplay(args.env)) return null;
  if (!args.teeReady) return "tee_unavailable";
  if (!args.redisReady && !args.internalService) {
    return "replay_backend_unavailable";
  }
  return null;
}
