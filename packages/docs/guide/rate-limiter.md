# Rate Limiter

## Overview

The rate limiter protects your API from burst abuse and accidental flooding. It applies a **global rate limit** per session (Hono) or per IP (Express) and a **stricter login limiter** on public auth routes to mitigate brute-force attacks.

The store differs per engine — the **Hono** engine keeps limits in Redis when available and falls back to in-memory storage; the **Express** engine uses `express-rate-limit` with its built-in memory store.

## Global Rate Limiter

Registered automatically in the HTTP middleware stack via `rateLimiterMiddleware`. Every request consumes from the same per-session/IP bucket:

```ts
// src/framework/http/app.ts — applied globally
app.use("*", rateLimiterMiddleware);
```

### Key generation

- **Hono** — authenticated requests are keyed by `sessionId`; anonymous requests fall back to the `x-forwarded-for` header.
- **Express** — requests are keyed by IP (`req.ip`, honoring trust proxy) via `express-rate-limit`.

## Login Limiter

The `loginLimiter` is applied to all public auth routes (`/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/refresh-token`) in `src/modules/auth/routes/api.ts`:

```ts
const publicRoute = createRouter()
  .group(loginLimiter)
  .api(registerRoute, register)
  .api(loginRoute, login);
// ...
```

It uses **IP-based** keying so a single IP cannot exceed the login limit regardless of how many sessions it opens.

## Changing Limits

### Via config file (recommended)

Edit `src/config/rateLimit.ts`:

```ts
export const rateLimitConfig = {
  windowMs: 60000, // 1 minute window
  maxRequests: 500, // per window (global)
  loginMaxRequests: 60, // per window (login, per IP)
  keyPrefix: `${redisConfig.prefix}:rl`,
};
```

### Per-route customization

To apply a different limit to a specific route group, create a new limiter in your route file or middleware file:

::: code-group

```ts [Hono]
import { rateLimiter, MemoryStore } from "hono-rate-limiter";

const uploadLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "unknown",
  store: new MemoryStore(),
  standardHeaders: "draft-6",
});

router.post("/upload", uploadLimiter, uploadHandler);
```

```ts [Express]
import { rateLimit } from "express-rate-limit";

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
});

router.post("/upload", uploadLimiter, uploadHandler);
```

:::

### Source files

| File                                | What it controls                                                     |
| ----------------------------------- | -------------------------------------------------------------------- |
| `src/config/rateLimit.ts`           | Rate limit settings (window, max, login max)                         |
| `src/framework/http/ratelimiter.ts` | Core limiter logic — lazy singleton, store selection, key generation |
| `src/framework/http/app.ts`         | Where `rateLimiterMiddleware` is registered globally                 |
| `src/modules/auth/routes/api.ts`    | Where `loginLimiter` is applied to public auth routes                |

## Environment Variables

| Variable       | Default                  | Description                                               |
| -------------- | ------------------------ | --------------------------------------------------------- |
| `REDIS`        | `false`                  | Enable Redis for persistent rate limiting across restarts |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Redis connection string                                   |
| `REDIS_PREFIX` | `nexwire`                 | Key prefix for namespacing                                |

## How It Works

When Redis is available (`REDIS=true`), the **Hono** engine stores limits in Redis under keys prefixed with `{REDIS_PREFIX}:rl:`. This ensures limits survive server restarts and are consistent across multiple instances.

When Redis is unavailable (Hono) — or on the `express-rate-limit` memory store (Express) — limits reset on server restart.

Both limiters send standard `RateLimit-*` headers (`draft-6`/`draft-7` format) so clients can programmatically back off.
