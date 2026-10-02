# `cache` — key-value cache

Imported from the facade: `import { cache } from "@/framework/facade.js"`.

Redis-backed JSON caching with graceful fallback — every method becomes a no-op (`false`/`fallback`) when Redis is unavailable. Keys are namespaced under `{REDIS_PREFIX}:cache:`. See [Cache](./../guide/cache).

## Functions

| Function            | Signature                                | Description                                                                                |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `cache.get`         | `(key, fallback?) => Promise<T \| null>` | Read a cached JSON value; returns `fallback` (default `null`) on miss or when Redis is off |
| `cache.set`         | `(key, value, ttl?) => Promise<boolean>` | Store a value with TTL (default from `config/cache.ts`); `false` when Redis is off         |
| `cache.forget`      | `(key) => Promise<boolean>`              | Delete a cached key (invalidate)                                                           |
| `cache.remember`    | `(key, ttl, callback) => Promise<T>`     | Cache-aside — `get` first, on miss run `callback` and `put`                                |
| `cache.isAvailable` | `() => boolean`                          | `true` when Redis is configured and connected                                              |

## Use cases

### Basic get / put

```ts
await cache.set("weather:london", { temp: 18, condition: "cloudy" }, 300);

const weather = await cache.get<{ temp: number; condition: string }>(
  "weather:london",
);
// null when missing or Redis unavailable
```

### Invalidate on write

```ts
await cache.forget("weather:london");
```

### Cache-aside with `remember`

```ts
const stats = await cache.remember("dashboard:stats", 60, async () => {
  return computeExpensiveStats(await db.select().from(orders).execute());
});
```

This is equivalent to:

```ts
let stats = await cache.get("dashboard:stats");
if (!stats) {
  stats = await computeExpensiveStats(...);
  await cache.set("dashboard:stats", stats, 60);
}
```

### Runtime guard

```ts
if (cache.isAvailable()) {
  await cache.set("key", value, 60);
}
```

## Notes

- Values are JSON-serialized — store plain objects, arrays, strings, or numbers.
- TTL is in **seconds**. The default (no `ttl` passed) comes from `ttlSeconds` in `src/config/cache.ts`.
- All methods degrade gracefully: `get` returns `fallback`, `put`/`forget` return `false`, `remember` falls through to executing the callback whenever Redis is unavailable.

