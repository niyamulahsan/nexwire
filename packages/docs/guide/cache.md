# Cache

## Overview

The cache system provides **Redis-backed key-value caching** with a graceful fallback when Redis is unavailable. Use it to store expensive computations, API responses, or any data that can be temporarily reused.

All cache operations are no-ops when Redis is not configured — they return `false` or the provided `fallback` value instead of throwing.

## Cache Utility

The `cache` object is exported from the facade:

```ts
import { cache } from "@/framework/facade.js";
```

| Method                               | Purpose                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `cache.get(key, fallback?)`          | Fetches a cached JSON value. Returns `fallback` (default `null`) on miss or when Redis is unavailable.                  |
| `cache.set(key, value, ttl?)`        | Stores a value with optional TTL (defaults to `ttlSeconds (config/cache.ts)`). Returns `false` if Redis is unavailable. |
| `cache.forget(key)`                  | Deletes a cached key. Use when the source data changes and the cache must be invalidated.                               |
| `cache.remember(key, ttl, callback)` | Cache-aside pattern — tries `get` first; on miss, executes `callback`, stores via `put`, and returns the fresh value.   |
| `cache.isAvailable()`                | Returns `true` if Redis is configured and connected. Use as a runtime guard.                                            |

## Usage

### Basic get / put

```ts
// Store
await cache.set("weather:london", { temp: 18, condition: "cloudy" }, 300);

// Retrieve
const weather = await cache.get<{ temp: number; condition: string }>(
  "weather:london",
);
```

### Delete / invalidate

```ts
await cache.forget("weather:london");
```

### Cache-aside with `remember`

```ts
const stats = await cache.remember("dashboard:stats", 60, async () => {
  const result = await db.select().from(orders).execute();
  return computeExpensiveStats(result);
});
```

This pattern is equivalent to:

```ts
let stats = await cache.get("dashboard:stats");
if (!stats) {
  stats = await computeExpensiveStats(await db.select().from(orders).execute());
  await cache.set("dashboard:stats", stats, 60);
}
```

## Environment Variables

| Variable       | Default                  | Description                       |
| -------------- | ------------------------ | --------------------------------- |
| `REDIS`        | `false`                  | Enable Redis (required for cache) |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Redis connection string           |
| `REDIS_PREFIX` | `nexwire`                 | Key prefix for namespacing        |

## Cache Configuration

Default TTL and other settings live in `src/config/cache.ts`:

| Setting      | Default         | Description                     |
| ------------ | --------------- | ------------------------------- |
| `ttlSeconds` | `3600` (1 hour) | Default TTL for cached values   |
| `keyPrefix`  | `nexwire:cache`  | Redis key prefix for cache keys |

## How It Works

Cache keys are namespaced under `{REDIS_PREFIX}:cache:{key}` in Redis. Values are JSON-serialized. When Redis is disabled (`REDIS=false`), all methods degrade gracefully without throwing.

