import { cookieConfig } from "./index.js";
import { redisConfig } from "./redis.js";

/**
 * Why: Server-side session cookie and lifetime settings.
 * When: Session middleware creates/refreshes sessions for each request.
 * Where: src/config/session.ts.
 * How: `cookieName` and `ttlSeconds` are plain literals; `keyPrefix` is
 *      derived from the shared `REDIS_PREFIX` (`nexwire:session:*` by default).
 */
export const sessionConfig = {
  cookieName: `${cookieConfig.name}_session`,
  ttlSeconds: 7200,
  keyPrefix: `${redisConfig.prefix}:session`
};

export type SessionConfig = typeof sessionConfig;
