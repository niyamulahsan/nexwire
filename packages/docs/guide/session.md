# Session

## Overview

The session system provides **Redis-backed server-side session state** with an automatic httpOnly cookie. It is distinct from auth — it works for both guests and logged-in users.

A `sessionId` is automatically attached to every request via `sessionMiddleware`. You can read it from the request context — `c.get("sessionId")` on Hono, `res.locals.sessionId` on Express — and then use the `session` utility to store/retrieve temporary data such as shopping carts, wizard progress, or UI preferences.

## Middleware

The `sessionMiddleware` runs on every request and is applied globally in `app.ts`. It:

1. Checks for an existing `nexwire_session` cookie (configured in `src/config/session.ts`)
2. If absent — generates a new `randomUUID()`, sets an httpOnly cookie with the configured TTL
3. Stores `sessionId` on the request context (`c.set`) Hono / `res.locals`) Express
4. Refreshes the session TTL on every request

No manual setup is needed. The middleware is already wired in the framework boot sequence.

## Session Utility

The `session` object is exported from the facade and provides seven methods for working with server-side session data:

```ts
import { session } from "@/framework/facade.js";
```

| Method                        | Purpose                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `session.start(data?)`        | Creates a new session document and returns its ID. Use when you need a server-side session that is independent of the request cookie flow. |
| `session.all(id)`             | Fetches the entire session payload as an object. Use when you need to inspect or iterate over all stored values.                           |
| `session.get(id, key)`        | Reads a single key from the session. Use when you need one specific value without manual parsing.                                          |
| `session.put(id, key, value)` | Writes or updates a single key in the session. Use when you need to persist incremental state (e.g., add an item to a cart).               |
| `session.refresh(id)`         | Extends the session TTL from the current moment. Called automatically by the middleware on every request.                                  |
| `session.destroy(id)`         | Deletes the session document from Redis. Use on logout or when invalidating a session.                                                     |
| `session.isAvailable()`       | Returns `true` if Redis is configured and connected. Use as a runtime guard before accessing session data.                                 |

## Usage

### Read the session ID

::: code-group

```ts [Hono]
const sessionId = c.get("sessionId");
```

```ts [Express]
const sessionId = res.locals.sessionId;
```

:::

### Store and retrieve data

```ts
// Save a cart
await session.put(sessionId, "cart", [
  { productId: 1, quantity: 2 },
  { productId: 5, quantity: 1 },
]);

// Read it back
const cart = await session.get<CartItem[]>(sessionId, "cart");
```

### Full payload

```ts
const data = await session.all(sessionId);
// { cart: [...], wizardStep: 3, preferences: {...} }
```

### Create an independent session

```ts
const newId = await session.start({ source: "webhook", ref: "abc" });
```

## Configuration

Session settings live in `src/config/session.ts`:

```ts
export const sessionConfig = {
  cookieName: `${cookieConfig.name}_session`, // "nexwire_session"
  ttlSeconds: 7200, // 2 hours, refreshed on each request
  keyPrefix: `${redisConfig.prefix}:session`, // "nexwire:session"
};
```

| Setting      | Default          | Description                                       |
| ------------ | ---------------- | ------------------------------------------------- |
| `cookieName` | `nexwire_session` | Name of the session cookie                        |
| `ttlSeconds` | `7200`           | Session TTL in seconds, refreshed on each request |
| `keyPrefix`  | `nexwire:session` | Redis key prefix for session storage              |

### Destroy a session

```ts
await session.destroy(sessionId);
```

> Note: `destroy` only removes the Redis document. The session cookie remains on the client — it will create a new empty session on the next request.

## How It Works

```
Client                          Server
  │                                │
  │  (first request)               │
  │ ───────────────────────────>   │
  │                                │  sessionMiddleware:
  │                                │    no cookie → generate UUID
  │                                │    set-cookie: nexwire_session=<uuid>
  │                                │    sessionId → c.set() (Hono)
  │                                │               → res.locals (Express)
  │                                │    session.refresh(<uuid>)
  │ <───────────────────────────   │
  │  Set-Cookie: nexwire_session=…  │
```

Data is stored in Redis under the key `{REDIS_PREFIX}:session:{sessionId}` as a JSON document with the configured TTL.
