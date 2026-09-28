import { redisConfig } from "./redis.js";

/**
 * Why: Redis cache TTL defaults and key namespace.
 * When: Cache helpers store values with an implicit expiry.
 * Where: src/config/cache.ts.
 * How: `ttlSeconds` is a plain literal; `keyPrefix` is derived from the
 *      shared `REDIS_PREFIX` so cache keys stay in one namespace
 *      (`nexwire:cache:*` by default).
 */
export const cacheConfig = {
  ttlSeconds: 3600,
  keyPrefix: `${redisConfig.prefix}:cache`
};

export type CacheConfig = typeof cacheConfig;
