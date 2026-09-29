# Configuration

All subsystem settings live in `src/config/`. Each file exports a typed config object that reads from environment variables and provides sensible defaults.

```
src/config/
├── index.ts          # Aggregated config barrel
├── app.ts            # App name, port, URL, feature flags
├── auth.ts           # Email verification toggle
├── cache.ts          # Cache TTL and key prefix
├── cookie.ts         # Cookie name and secret
├── cors.ts           # CORS origin settings
├── database.ts       # Database URL and dialect detection
├── jwt.ts            # Access/refresh secrets, expiry times
├── logging.ts        # Log level and HTTP request logging
├── mail.ts           # SMTP host, port, credentials
├── openapi.ts        # OpenAPI spec and Scalar UI settings
├── queue.ts          # Queue names, concurrency, BullBoard
├── rateLimit.ts      # Window, max requests, login limit
├── realtime.ts       # Socket.IO enabled flag and path
├── redis.ts          # Redis URL, prefix, feature toggle
├── security.ts       # Security headers (CSP, HSTS, X-Frame)
├── session.ts        # Session cookie name, TTL
├── storage.ts        # Storage driver, S3 settings
└── validate.ts       # Cross-config validation at startup
```

## Usage

Import individual configs or the aggregated barrel:

```ts
// Single config
import { jwtConfig } from "@/config/jwt.js";

// Aggregated config
import { config } from "@/config/index.js";

console.log(config.jwt.accessSecret);
console.log(config.cache.ttlSeconds);
```

## App

```ts
// src/config/app.ts
export default {
  name: env.APP_NAME, // "nexwire"
  environment: env.APP_ENV, // "development" | "production" | "test"
  port: env.APP_PORT, // 3000
  url: env.APP_URL, // "http://localhost:3000"
  frontendUrl: env.FRONTEND_URL, // URL of the frontend app (for cookie/Session/realtime cross-origin setups)
  openApiEnabled: env.OPEN_API, // /api-docs endpoint
  uiEnabled: env.UI, // serve Vue SPA
};
```

## OpenAPI

```ts
// src/config/openapi.ts
export default {
  version: "3.0.0",
  title: "nexwire API",
  apiVersion: "1.0.0",
  description: "",

  scalar: {
    specUrl: "/doc",
    docsPath: "/api-docs", // change this to rename the docs URL
    layout: "classic", // "classic" | "modern"
    theme: "moon", // "default" | "moon" | "purple" | "solarized" | "bluePlanet" | "fastify" | "kepler" | "mars" | "nebula" | "none"
    pageTitle: "nexwire API",
    favicon: "src/resources/src/assets/images/favicon/favicon.ico", // served at /favicon.ico for the docs page
    defaultHttpClient: {
      targetKey: "js",
      clientKey: "fetch",
    },
    defaultOpenAllTags: true,
  },
};
```

Controls the OpenAPI spec metadata and the Scalar docs UI at `/api-docs`. Requires `OPEN_API=true` in `.env`. See [OpenAPI](/guide/openapi) for the full guide.

## Auth

```ts
// src/config/auth.ts
export default {
  requireEmailVerification: false,
};
```

When `true`, users must verify their email before logging in. Requires mail configuration and a running queue worker.

## JWT

```ts
// src/config/jwt.ts
export default {
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessExpirySeconds: 900, // 15 minutes
  refreshExpirySeconds: 3600, // 1 hour
  refreshRememberExpirySeconds: 2592000, // 30 days
  algorithm: "HS256",
};
```

## Database

```ts
// src/config/database.ts
export default {
  url: env.DATABASE_URL,
};
```

The dialect (`mysql`, `postgresql`, `sqlite`) is auto-detected from the URL prefix. The `databaseDialect` constant and `detectDialectFrom()` helper are also exported.

## Redis

```ts
// src/config/redis.ts
export default {
  enabled: env.REDIS, // read from REDIS env var
  url: env.REDIS_URL,
  prefix: env.REDIS_PREFIX, // "nexwire"
  commanderPort: 1369,
};
```

Redis must be explicitly enabled. When `enabled: false`, all Redis-backed services degrade gracefully.

## Cache

```ts
// src/config/cache.ts
export default {
  ttlSeconds: 3600, // 1 hour
  keyPrefix: `${redisConfig.prefix}:cache`, // "nexwire:cache"
};
```

## Session

```ts
// src/config/session.ts
export default {
  cookieName: `${cookieConfig.name}_session`, // "nexwire_session"
  ttlSeconds: 7200, // 2 hours
  keyPrefix: `${redisConfig.prefix}:session`, // "nexwire:session"
};
```

## Queue

```ts
// src/config/queue.ts
export default {
  queues: ["default", "mail", "maintenance"], // default queue, you can add or remove
  concurrency: 10,
  autoPruneQueues: true, // auto remove stale key value
  prefix: `${redisConfig.prefix}:queue`, // "nexwire:queue"
  durablePrefix: `${redisConfig.prefix}:durable`, // "nexwire:durable"
  queueUi: "/queues", // queue dashboard
  allowedEmails: "", // comma-separated emails allowed to access the queue dashboard
};
```

## Rate Limiter

```ts
// src/config/rateLimit.ts
export default {
  windowMs: 60000, // 1 minute
  maxRequests: 500, // per window (global)
  loginMaxRequests: 60, // per window (login)
  keyPrefix: `${redisConfig.prefix}:rl`, // "nexwire:rl"
};
```

## Realtime

```ts
// src/config/realtime.ts
import { env } from "@/env.js";

export default {
  enabled: env.SOCKET, // enable Socket.IO realtime events (dispatchEvent)
  path: "/socket.io",
};
```

## Mail

```ts
// src/config/mail.ts
export default {
  host: "127.0.0.1",
  port: 1089,
  encryption: "none",
  username: env.MAIL_USERNAME,
  password: env.MAIL_PASSWORD,
  fromAddress: "no-reply@example.com",
  failSilent: true,
  maildev: {
    // this is dev mode
    smtpPort: 1089,
    webPort: 1080,
  },
};
```

## Storage

```ts
// src/config/storage.ts
export default {
  driver: "local", // "local" | "s3"
  defaultDisk: "public", // "public" | "private" | "tmp"
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  forcePathStyle: false, // true for MinIO
  signedUrlTtlSeconds: 900, // 15 minutes
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
};
```

## Cookie

```ts
// src/config/cookie.ts
export default {
  name: "nexwire",
  secret: env.COOKIE_SECRET,
};
```

## CORS

Controls which origins can access the API. Default is `"*"` (open to all) — tighten this to specific origins in production, especially when using credentialed requests (cookies, auth headers). Change `origin` to your frontend URL(s) before deploying.

```ts
// src/config/cors.ts
export default {
  origin: "*", // reflects request origin for credentialed requests (* or http://placeholder.com)
};
```

## Logging

```ts
// src/config/logging.ts
export default {
  level: "info", // "fatal"|"error"|"warn"|"info"|"debug"|"trace"
  httpRequests: true, // log per-request HTTP access lines
};
```

## Security

Controls security headers applied to all responses. Enabled by default in production via `SECURITY_HEADERS`:

```ts
// src/config/security.ts
import { env } from "@/env.js";

const isProd = env.APP_ENV === "production";

/**
 * Dev CSP is intentionally lax so HMR / inline bootstrap scripts work.
 * Prod CSP is strict and blocks unsafe-inline.
 *
 * NOTE: if you serve a bundled SPA (Vite/Next) in prod, you MUST add
 * either a nonce, a hash, or 'unsafe-inline' to script-src — otherwise
 * the inline bootstrap script will be blocked.
 */
const csp = isProd
  ? [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",         // Scalar loads its UI bundle from jsdelivr CDN
      "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.scalar.com",
      "connect-src 'self' https://cdn.jsdelivr.net https://api.scalar.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ")
  : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.scalar.com",
      "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://api.scalar.com",  // HMR websocket + Scalar
      "frame-ancestors 'none'"
    ].join("; ");

export const securityConfig = {
  enabled: env.SECURITY_HEADERS,
  csp,
  hsts: env.APP_ENV === "production",
  hstsMaxAge: "max-age=31536000; includeSubDomains",
  xFrame: "DENY"
};

export type SecurityConfig = typeof securityConfig;
```

- **CSP** (`csp`): Content Security Policy. Strict in prod and blocks `unsafe-inline`; lax in dev so HMR / inline bootstrap work. The **Scalar CDN hosts** (`cdn.jsdelivr.net` for the UI bundle, `fonts.scalar.com` for fonts, `api.scalar.com` for the spec registry) are allowlisted in both branches — edit `src/config/security.ts` to add/remove hosts, no middleware changes needed.
- **HSTS** (`hsts`): HTTP Strict Transport Security. Enabled automatically in production; disables in development.
- **X-Frame** (`xFrame`): Clickjacking protection. `DENY` prevents embedding in iframes.

Access via `securityConfig` from the facade or `config.security`.

## Validate

`validateConfig()` in `src/config/validate.ts` runs at startup (before `storage.init()` and `initRedis()`) and checks that resolved configs are internally consistent. It throws clear errors for:

- `DATABASE_URL` missing or empty
- S3 `bucket`, `accessKeyId`, `secretAccessKey` required when driver is `s3`
- `REDIS_URL` must include host and port when Redis is enabled
- `MAIL_USERNAME` required when `MAIL_FAIL_SILENT` is `false`

## Redis Key Namespace

All Redis keys are prefixed with `REDIS_PREFIX` (default `nexwire`):

| Service       | Key Pattern        | Config              |
| ------------- | ------------------ | ------------------- |
| Cache         | `nexwire:cache:*`   | `cache.ts`          |
| Session       | `nexwire:session:*` | `session.ts`        |
| Queue         | `nexwire:queue:*`   | `queue.ts`          |
| Durable Queue | `nexwire:durable:*` | `queue.ts`          |
| Rate Limit    | `nexwire:rl:*`      | `rateLimit.ts`      |
| Broadcast     | `nexwire:broadcast` | `redis.ts` (prefix) |
