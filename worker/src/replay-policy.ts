/**
 * Production must use Redis for payment replay claims (no LRU after restart).
 * Dev/test without Redis may fall through to the in-process LRU.
 */
export function productionRequiresRedisReplay(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = (
    env.APP_ENVIRONMENT ||
    env.ENVIRONMENT ||
    env.NODE_ENV ||
    ""
  ).toLowerCase();
  return value === "production";
}

/** True when Redis is down and LRU fallthrough is allowed (non-production). */
export function allowLruReplayFallback(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !productionRequiresRedisReplay(env);
}
