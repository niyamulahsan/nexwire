import { cacheConfig, redisConfig } from "@/config/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

function cacheKey(key: string) {
  return `${cacheConfig.keyPrefix}:${key}`;
}

/**
 * Why: Provides Redis-backed cache helpers with graceful fallback behavior.
 * When: Controllers/jobs need temporary computed data caching.
 * Where: Application module code via facade.
 * How: Uses namespaced Redis keys and JSON serialization.
 */
export const cache = {
  /**
   * Why: Reads cached JSON value by key.
   * When: A feature wants fast lookup before recomputing.
   * Where: Controllers/jobs/services using shared cache.
   * How: Fetches namespaced Redis key and parses JSON.
   */
  async get<T>(key: string, fallback: T | null = null) {
    const client = redisClientIfReady();
    if (!client) return fallback;

    const value = await client.get(cacheKey(key));
    return value ? (JSON.parse(value) as T) : fallback;
  },

  /**
   * Why: Stores value in cache with TTL.
   * When: Data should be reused for a limited period.
   * Where: Application code caching expensive results.
   * How: Serializes value and writes with Redis EX seconds.
   */
  async put(key: string, value: unknown, ttl = cacheConfig.ttlSeconds) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.set(cacheKey(key), JSON.stringify(value), "EX", ttl);
    return true;
  },

  /**
   * Why: Deletes a cached value by key.
   * When: Cached data becomes stale or must be invalidated.
   * Where: Write/update flows that change source data.
   * How: Removes namespaced Redis cache key.
   */
  async forget(key: string) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.del(cacheKey(key));
    return true;
  },

  /**
   * Why: Returns cached value or computes/stores a fresh one.
   * When: A feature needs cache-aside behavior.
   * Where: Read paths with potentially expensive callbacks.
   * How: Attempts get first, then executes callback and put.
   */
  async remember<T>(key: string, ttl: number, callback: () => Promise<T>) {
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await callback();
    await this.put(key, fresh, ttl);
    return fresh;
  },

  /**
   * Why: Indicates whether Redis cache backend is currently usable.
   * When: Runtime checks need to branch on cache availability.
   * Where: Health/status endpoints and conditional flows.
   * How: Confirms REDIS flag and ready Redis client instance.
   */
  isAvailable() {
    return redisConfig.enabled && redisClientIfReady() !== null;
  }
};
