import { redisConfig } from "./redis.js";

/**
 * Why: HTTP rate limiting policy and Redis key namespace.
 * When: Global and login-specific rate limiters are built.
 * Where: src/config/rateLimit.ts.
 * How: Limits are plain literals; `keyPrefix` is derived from the shared
 *      `REDIS_PREFIX` (`nexwire:rl:*` by default).
 */
export const rateLimitConfig = {
  windowMs: 60000,
  maxRequests: 500,
  loginMaxRequests: 60,
  keyPrefix: `${redisConfig.prefix}:rl`
};

export type RateLimitConfig = typeof rateLimitConfig;
