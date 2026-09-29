import { Redis } from "ioredis";
import { redisConfig } from "@/config/index.js";
import { CircuitBreaker } from "@/framework/circuit-breaker/cb.js";
import { logger } from "@/framework/support/logger.js";

export type redis = Redis;

let client: redis | null = null;
let ready = false;
let lastError: string | null = null;
let redisBreaker: CircuitBreaker | null = null;

if (redisConfig.enabled) {
  redisBreaker = new CircuitBreaker();
}

function safeRedisUrl() {
  try {
    const url = new URL(redisConfig.url);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return redisConfig.url;
  }
}

/**
 * Why: Initializes shared Redis connection for cache/queue/events/session.
 * When: Runtime bootstrap before Redis-backed features are used.
 * Where: Server, worker, scheduler startup paths.
 * How: Connects once, tracks readiness, and degrades gracefully if unavailable.
 */
export async function initRedis() {
  if (client) return client;

  if (!redisConfig.enabled) {
    ready = false;
    lastError = "redis disabled in config";
    logger.info("Redis disabled; cache, session storage, queue, events, and cockpit unavailable");
    return null;
  }

  if (redisBreaker?.getState() === "open") {
    lastError = "redis circuit breaker is open";
    logger.warn("Redis circuit breaker is open; skipping connection");
    return null;
  }

  try {
    client = new Redis(redisConfig.url, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null
    });

    client.on("error", (error) => {
      lastError = error.message;
      if (ready) {
        logger.warn("Redis connection error", {
          redisUrl: safeRedisUrl(),
          error: error.message
        });
      }
    });

    await client.connect();
    await client.ping();
    ready = true;
    redisBreaker?.onSuccess();
    return client;
  } catch (error) {
    lastError ||= error instanceof Error ? error.message : String(error);
    client?.disconnect();
    client = null;
    ready = false;
    redisBreaker?.onFailure();
    logger.warn(`Redis unavailable; continuing without Redis features (${lastError})`);
    return null;
  }
}

/**
 * Why: Returns the current Redis client instance.
 * When: Internal helpers need direct Redis operations.
 * Where: Cache/session/queue/events modules.
 * How: Returns nullable singleton without creating a new connection.
 */
export function redis() {
  return client;
}

/**
 * Why: Indicates whether Redis is connected and usable.
 * When: Features need to branch on Redis availability.
 * Where: Cache/session/queue/event internals.
 * How: Combines readiness flag with client presence.
 */
export function redisReady() {
  return ready && client !== null;
}

/**
 * Why: Provides a single ready-checked Redis client accessor.
 * When: Redis-backed modules need quick availability guard.
 * Where: Cache/session/queue/events/BullBoard internals.
 * How: Returns connected client or null when Redis is unavailable.
 */
export function redisClientIfReady() {
  if (redisBreaker?.getState() === "open") return null;
  return redisReady() ? client : null;
}

/**
 * Why: Exposes last Redis error for diagnostics.
 * When: Startup or health logs need failure detail.
 * Where: Runtime status output.
 * How: Returns cached error message string.
 */
export function redisError() {
  return lastError;
}

/**
 * Why: Returns the Redis circuit breaker instance or null when disabled.
 * When: Health checks and diagnostics need breaker state.
 * Where: Runtime status and monitoring paths.
 * How: Returns the breaker if Redis is enabled, null otherwise.
 */
export function getRedisBreaker() {
  return redisBreaker;
}

/**
 * Why: Closes Redis connection during graceful shutdown.
 * When: Process stop hooks for server/worker/scheduler.
 * Where: Runtime lifecycle files.
 * How: Attempts quit, falls back to disconnect, then resets state.
 */
export async function closeRedis() {
  if (!client) return;

  try {
    await client.quit();
  } catch {
    client.disconnect();
  } finally {
    client = null;
    ready = false;
  }
}
