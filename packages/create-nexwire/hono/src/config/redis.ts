import { env } from "@/env.js";

/**
 * Why: Redis connection and namespace settings.
 * When: Cache, session, queue, events, and the queue dashboard bootstrap.
 * Where: src/config/redis.ts.
 * How: `prefix` is shared by cache/session/queue/events, so it stays in .env
 *      (`REDIS_PREFIX`) and every namespace derives from it here. `enabled`
 *      and the commander port are literals you can change here.
 */
export const redisConfig = {
  enabled: env.REDIS,
  url: env.REDIS_URL,
  prefix: env.REDIS_PREFIX,
  commanderPort: 1369
};

export type RedisConfig = typeof redisConfig;
