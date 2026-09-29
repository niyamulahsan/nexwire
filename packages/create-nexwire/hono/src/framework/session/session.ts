import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { appConfig, redisConfig, sessionConfig } from "@/config/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

/** Extract origin from a URL string. Returns empty string on invalid/missing input. */
function originOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Returns true when FRONTEND_URL and APP_URL point to different origins — requires SameSite=None; Secure for session cookies. */
function needsCrossSiteCookie() {
  const appOrigin = originOf(appConfig.url);
  const frontendOrigin = originOf(appConfig.frontendUrl);
  return Boolean(appOrigin && frontendOrigin && appOrigin !== frontendOrigin);
}

/** Builds the Redis key for a session id using the configured prefix. */
function sessionKey(id: string) {
  return `${sessionConfig.keyPrefix}:${id}`;
}

/**
 * Global middleware that ensures every request has a session cookie.
 * - Reads existing session cookie from request.
 * - If missing: generates a UUID, sets a new cookie (SameSite=None; Secure if cross-origin, else Lax).
 * - Stores sessionId in Hono context (`c.get("sessionId")`).
 * - Refreshes the Redis session TTL on every request.
 */
export async function sessionMiddleware(c: Context, next: Next) {
  let sessionId = getCookie(c, sessionConfig.cookieName);

  if (!sessionId) {
    sessionId = randomUUID();
    const crossSiteCookie = needsCrossSiteCookie();
    setCookie(c, sessionConfig.cookieName, sessionId, {
      httpOnly: true,
      sameSite: crossSiteCookie ? "None" : "Lax",
      secure: crossSiteCookie,
      path: "/",
      maxAge: sessionConfig.ttlSeconds
    });
  }

  c.set("sessionId", sessionId);
  await session.refresh(sessionId);
  await next();
}

/** Redis-backed server-side session store. Each session is a namespaced JSON document with configurable TTL. */
export const session = {
  /** Create a new session document in Redis. Returns the generated session id, or empty string when Redis is unavailable. */
  async start(data: Record<string, unknown> = {}) {
    const client = redisClientIfReady();
    if (!client) return "";

    const id = randomUUID();
    await client.set(sessionKey(id), JSON.stringify(data), "EX", sessionConfig.ttlSeconds);
    return id;
  },

  /** Get the full session payload for a given id. Returns null when session doesn't exist or Redis is unavailable. */
  async all<T = Record<string, unknown>>(id: string): Promise<T | null> {
    const client = redisClientIfReady();
    if (!client) return null;

    const data = await client.get(sessionKey(id));
    return data ? JSON.parse(data) : null;
  },

  /** Read a single key from the session payload. Returns null if the key or session doesn't exist. */
  async get<T>(id: string, key: string): Promise<T | null> {
    const data = await session.all<Record<string, T>>(id);
    return data?.[key] ?? null;
  },

  /** Write or update a single key in the session payload. Rewrites the entire document with a fresh TTL. Returns false when Redis is unavailable. */
  async put(id: string, key: string, value: unknown) {
    const client = redisClientIfReady();
    if (!client) return false;

    const data = (await session.all<Record<string, unknown>>(id)) || {};
    data[key] = value;
    await client.set(sessionKey(id), JSON.stringify(data), "EX", sessionConfig.ttlSeconds);
    return true;
  },

  /** Extend the TTL of an existing session. Called automatically by sessionMiddleware. Returns false when Redis is unavailable. */
  async refresh(id: string) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.expire(sessionKey(id), sessionConfig.ttlSeconds);
    return true;
  },

  /** Delete a session document from Redis. Use on logout or session expiry. Returns false when Redis is unavailable. */
  async destroy(id: string) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.del(sessionKey(id));
    return true;
  },

  /** Returns true when Redis is enabled and the Redis client is ready — guards against using session store without Redis. */
  isAvailable() {
    return redisConfig.enabled && redisClientIfReady() !== null;
  }
};
