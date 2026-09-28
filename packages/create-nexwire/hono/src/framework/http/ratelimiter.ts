import type { Context, MiddlewareHandler, Next } from "hono";
import { MemoryStore, RedisStore, rateLimiter } from "hono-rate-limiter";
import { rateLimitConfig } from "@/config/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

/**
 * Why: Protects API from burst abuse and accidental flooding.
 * When: Applied globally in HTTP middleware chain.
 * Where: App bootstrap middleware stack.
 * How: Limits requests per-user (authenticated) or per-session (guest)
 *      using Redis store when available, falling back to in-memory.
 *      Sends standard RateLimit-* headers so clients can back off.
 */

function adaptRedis(raw: any) {
  return {
    scriptLoad: (script: string) => raw.script("load", script),
    evalsha: (sha1: string, keys: string[], args: unknown[]) => raw.evalsha(sha1, keys.length, ...keys, ...args),
    decr: (key: string) => raw.decr(key),
    del: (key: string) => raw.del(key)
  };
}

const REDIS_RETRY_MS = 30_000;

/**
 * Why: Uses Redis for distributed rate limiting when available, but never lets
 *      a Redis outage break requests.
 * When: The global and login limiters run on every request; Redis can go away
 *      after the middleware was already built (so the store choice cannot be
 *      frozen at first request).
 * Where: src/framework/http/ratelimiter.ts.
 * How: Backs every call with an always-usable MemoryStore. A RedisStore is
 *      created lazily (after a ping health check) and used only while it
 *      responds; any Redis command failure drops the store and starts a
 *      cooldown, during which traffic is served from memory. After the
 *      cooldown the store is re-attempted, so a recovered Redis is picked up.
 */
function createFailingOverStore() {
  const memoryStore = new MemoryStore();
  let redisStore: RedisStore | null = null;
  let cooldownUntil = 0;
  let options: any = null;

  function enterCooldown() {
    redisStore = null;
    cooldownUntil = Date.now() + REDIS_RETRY_MS;
  }

  async function redisStoreIfUsable() {
    if (cooldownUntil > Date.now()) return null;

    if (!redisStore) {
      const raw = redisClientIfReady();
      if (!raw) return null;

      try {
        await raw.ping();
      } catch {
        enterCooldown();
        return null;
      }

      try {
        redisStore = new RedisStore({ client: adaptRedis(raw), prefix: rateLimitConfig.keyPrefix });
        redisStore.init(options);
      } catch {
        enterCooldown();
        return null;
      }
    }

    return redisStore;
  }

  return {
    init(opts: any) {
      options = opts;
      memoryStore.init(opts);
    },

    async increment(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          return await redis.increment(key);
        } catch {
          enterCooldown();
        }
      }
      return memoryStore.increment(key);
    },

    async decrement(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          await redis.decrement(key);
          return;
        } catch {
          enterCooldown();
        }
      }
      memoryStore.decrement(key);
    },

    async resetKey(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          await redis.resetKey(key);
          return;
        } catch {
          enterCooldown();
        }
      }
      memoryStore.resetKey(key);
    },

    async get(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          const info = await redis.get(key);
          if (info) return info;
        } catch {
          enterCooldown();
        }
      }
      return memoryStore.get(key);
    }
  };
}

let middleware: MiddlewareHandler | null = null;

export const rateLimiterMiddleware = async (c: Context, next: Next) => {
  if (!middleware) {
    middleware = rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.maxRequests,
      keyGenerator: (c: any) => {
        const sessionId = c.get("sessionId");
        if (sessionId) return `session:${sessionId}`;
        return c.req.header("x-forwarded-for") ?? "unknown";
      },
      store: createFailingOverStore(),
      standardHeaders: "draft-6"
    });
  }

  return middleware(c, next);
};

let loginLimiterMiddleware: MiddlewareHandler | null = null;

export const loginLimiter = async (c: Context, next: Next) => {
  if (!loginLimiterMiddleware) {
    loginLimiterMiddleware = rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.loginMaxRequests,
      keyGenerator: (c: any) => {
        const ip = c.req.header("x-forwarded-for") ?? "unknown";
        return `login:${ip}`;
      },
      store: createFailingOverStore(),
      standardHeaders: "draft-6"
    });
  }

  return loginLimiterMiddleware(c, next);
};
