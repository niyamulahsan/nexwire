# Introduction

nexwire is a full-stack TypeScript framework that combines a Hono (default) or Express API server, a Vite UI (Vue 3 by default, swappable for React/Svelte/Solid/etc.), Drizzle ORM for the database, and Redis for caching, sessions, queues, and realtime — all wired together with a single CLI.

## Why nexwire?

Full-stack TypeScript today means choosing ten libraries and gluing them together by hand. Every choice locks you in. Every glue point is somewhere things break.

nexwire makes those choices for you, and lets you override the ones that matter.

- HTTP engine — Hono (default) or Express. Pick at scaffold time. Same module code either way.
- UI framework — Vue 3 by default, swappable for React/Svelte/Solid.
- Database — Drizzle ORM with SQLite, MySQL, or PostgreSQL. Dialect auto-detected from DATABASE_URL.
- Redis — one client, one config, powering sessions, cache, queues, rate limiting, and pub/sub.
- Realtime — Socket.IO with automatic auth, room assignment, and broadcasts.
- Deploy — one command to any Linux VPS. SSH + Docker. No CI/CD platform required.

You write modules. The framework wires them.

## A real example

Three files. No manual registration.

```ts
// src/modules/posts/database/models/post.ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

```ts
// src/modules/posts/routes/api.ts
import { db, group, paginateModel } from "@/framework/facade.js";
import { posts } from "../database/models/post.js";

export default group()
  .get("/", (c) => paginateModel(c, posts))
  .post("/", async (c) => {
    const body = await c.req.json();
    const [post] = await db.insert(posts).values(body).returning();
    return c.json(post, 201);
  });
```

```bash
# Migrate and seed — both auto-discovered
bun maker db:migrate --seed
```

The route file is picked up automatically. The model is used by the migration system. The seeder (if you add one) is sorted by foreign key dependencies. No index.ts to update.

## Who nexwire is for

- Solo developers building SaaS, internal tools, or client projects who want a batteries-included stack without weeks of architecture decisions.
- Growing teams that need consistent conventions and clear module boundaries — so a codebase can expand without becoming a pile of glue code.
- Backend developers moving into full-stack who want a familiar server setup (Hono/Express + Drizzle + Redis) with a UI that just works.
- Startup founders who need to move fast — scaffold, run dev, ship features.
- Laravel / Rails / Django developers looking for a TypeScript equivalent with routing, ORM, queues, cache, auth, realtime, and deployment in one package.
- Teams scaling past their first architecture who want module isolation, engine choice, and one-command deployment without adopting a heavyweight DI framework.

## Who nexwire is not for

- Projects that need fine-grained control over every dependency.
- Teams already committed to a meta-framework like Next.js or Nuxt.
- Static sites or purely serverless functions with no database.

## Everything in One Import

All features are accessible from a single facade:

::: code-group

```ts [Hono]
import {
  db,
  cache,
  session,
  queue,
  queueJob,
  shouldQueue,
  defineSchedule,
  broadcast,
  notify,
  storage,
  jwt,
  cookie,
  mail,
  password,
  logger,
  urls,
  paginate,
  validate,
  createRouter,
  group,
  createRoute,
  z,
} from "@/framework/facade.js";
```

```ts [Express]
import {
  db,
  cache,
  session,
  queue,
  queueJob,
  shouldQueue,
  defineSchedule,
  broadcast,
  notify,
  storage,
  jwt,
  cookie,
  mail,
  password,
  logger,
  urls,
  paginate,
  validate,
  createRouter,
  group,
  createRoute,
  z,
  fields, // multer-driven multipart field parsing
  upload, // multer-driven file upload middleware
} from "@/framework/facade.js";
```

:::

The Hono engine parses multipart natively via `c.req.parseBody()` — no `upload`/`fields` helpers needed. The Express engine relies on `multer`; see [Upload](../api/upload).

## Minimal example

Here is a minimal example (with `OPEN_API=true`):

::: code-group

```ts [Hono]
// src/modules/posts/routes/api.ts
import {
  createRoute,
  group,
  HttpStatusCodes,
  jsonContent,
} from "@/framework/facade.js";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  responses: { [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list") },
});

export default group().api(listRoute, (c) =>
  c.json([{ id: 1, title: "Hello" }]),
);
```

```ts [Express]
// src/modules/posts/routes/api.ts
import {
  createRoute,
  group,
  HttpStatusCodes,
  jsonContent,
} from "@/framework/facade.js";
import type { Request, Response } from "express";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  responses: { [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list") },
});

export default group().api(listRoute, (_req: Request, res: Response) =>
  res.json([{ id: 1, title: "Hello" }]),
);
```

:::

With `OPEN_API=false`, the same route looks like:

::: code-group

```ts [Hono]
import { group } from "@/framework/facade.js";

export default group().get("/", (c) => c.json([{ id: 1, title: "Hello" }]));
```

```ts [Express]
import { group } from "@/framework/facade.js";
import type { Request, Response } from "express";

export default group().get("/", (_req: Request, res: Response) =>
  res.json([{ id: 1, title: "Hello" }]),
);
```

:::

The above example auto-registers the route — no manual wiring needed. Create a file, export a group, and it works.

## API-Only Mode

You don't have to use the built-in UI. Set `UI=false` in `.env` and nexwire becomes a pure API server — perfect if you already have a React, Next.js, Flutter, or mobile app that needs a backend.

```bash
# .env
UI=false
```

The API runs standalone at `http://localhost:3000` with OpenAPI docs at `/api-docs`. Your separate UI connects via HTTP, WebSocket, or both.

## Separate UI

If your UI lives in a different repo or uses a different framework, nexwire still gives you everything you need out of the box:

- **Cache** — avoid hitting the database on every request
- **Session** — server-side sessions with cross-origin cookie support
- **Queue** — background jobs processed by workers
- **Realtime** — push events to connected clients via WebSocket
- **Scheduler** — cron jobs with distributed locking

```ts
// Your separate UI connects to the API
const res = await fetch("http://localhost:3000/api/posts");
```

The CORS middleware automatically allows your `FRONTEND_URL`, so there's no extra config needed.

## Cache

Redis-backed caching with a cache-aside pattern. The cache is Redis-only — if Redis is down, caching silently disables itself: `get` returns `null`, `set`/`forget` become no-ops, and `remember` recomputes the fresh value on every call (typically a database query). No crashes, no errors — but without Redis there is no caching, so reads hit the source every time.

```ts
import { cache } from "@/framework/facade.js";

// Cache-aside: compute once, serve from cache
const posts = await cache.remember("posts:all", 600, async () => {
  return await db.query.posts.findMany();
});

// Manual control
await cache.set("config:sitemap", sitemapXml, 3600); // cache.put is deprecated
const cached = await cache.get("config:sitemap");
await cache.forget("config:sitemap");
```

## Session

Server-side sessions stored in Redis with automatic cookie management. Supports cross-origin setups where your API and UI run on different domains.

```ts
import { session } from "@/framework/facade.js";

// In a route handler
const sessionId = await session.start({ userId: user.id, role: "admin" });
const user = await session.get(sessionId, "user");
await session.set(sessionId, "lastSeen", new Date().toISOString()); // session.put is deprecated
await session.destroy(sessionId); // logout
```

## Queue with Durable Jobs

BullMQ-powered background processing with a web dashboard. Jobs can be durable — if the worker crashes mid-job, it resumes from the last checkpoint instead of starting over.

```ts
import { queueJob, shouldQueue } from "@/framework/facade.js";

// Register a durable handler (survives crashes)
shouldQueue(
  "send-email",
  "mail",
  async (job, ctx) => {
    await ctx.step("validate", async () => {
      validateEmailData(job.data);
    });
    await ctx.step("send", async () => {
      await mail.sendMail({
        to: job.data.to,
        subject: job.data.subject,
        html: job.data.body,
      });
    });
  },
  { durable: true },
);

// Enqueue a job
await queueJob(
  "send-email",
  { to: "user@example.com", subject: "Welcome!", body: "<h1>Welcome</h1>" },
  { queue: "mail" },
);

// With delay (seconds), priority, and retry
await queueJob("send-email", data, {
  queue: "mail",
  delay: 5,
  priority: 1,
  attempts: 3,
});
```

The queue dashboard is available at `/queues` with email-based access control.

## Scheduler with Distributed Locking

Cron-based task scheduling with a Redis lock that prevents duplicate runs across multiple server instances. If Redis is unavailable, it falls back to a database lock automatically.

```ts
import { defineSchedule } from "@/framework/facade.js";

// Run every hour — never duplicates across instances
defineSchedule({
  name: "cleanup-sessions",
  expression: "0 * * * *",
  handler: async () => {
    const keys = await cache.forget("session:*");
    logger.info("Cleaned expired sessions");
  },
});

// Or dispatch to a queue worker
defineSchedule({
  name: "daily-reports",
  expression: "0 8 * * *",
  queue: "reports",
  job: "generate-daily",
});
```

## Storage

Unified file storage that works with the local filesystem or any S3-compatible service (AWS S3, MinIO, etc.). Switch drivers by changing `driver` in `src/config/storage.ts`.

```ts
import { storage } from "@/framework/facade.js";

const fileBuffer = Buffer.from("avatar bytes"); // e.g. fs.readFile(...) or an upload
// Write a file
await storage.put("avatars/user-1.jpg", fileBuffer);

// Read, check, delete
const content = await storage.get("avatars/user-1.jpg");
const exists = await storage.exists("avatars/user-1.jpg");
await storage.delete("avatars/user-1.jpg");

// Generate a signed URL for temporary access
const url = await storage.temporaryUrl("private/report.pdf", 3600);
```

Uploading a browser `File` is the only engine difference — the `storage` calls are identical:

::: code-group

```ts [Hono]
const body = await c.req.parseBody();
const file = body.file;
if (!(file instanceof File))
  return c.json({ message: "File is required" }, 422);
await storage.disk("public").putFile("uploads", file);
```

```ts [Express]
export default group().api(
  uploadRoute,
  [upload({ field: "file" })],
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(422).json({ message: "File is required" });
    await storage.disk("public").putFile("uploads", req.file);
    res.json({ message: "Uploaded", path: "uploads/" + req.file.filename });
  },
);
```

:::

## Realtime

Socket.IO-powered WebSocket communication with automatic authentication. Clients are placed into rooms based on their user ID and roles — broadcast to everyone, specific users, or specific roles.

```ts
import { broadcast } from "@/framework/facade.js";

// Send to everyone
broadcast("post.created", { id: 1, title: "New Post" }, { all: true });

// Send to specific users
broadcast(
  "notification",
  { message: "You have a new order" },
  { users: ["user-123"] },
);

// Send to a role
broadcast("announcement", { text: "System maintenance" }, { roles: ["admin"] });
```

On the UI side, the Socket.IO client automatically connects and authenticates using the session cookie.

## Notifications

Multi-channel notifications that persist to the database, broadcast via WebSocket, and optionally send an email — all in one call.

```ts
import { notify } from "@/framework/facade.js";

// Database + realtime broadcast
await notify(userId, {
  type: "order",
  title: "Order Shipped",
  body: "Your order #1234 has been shipped.",
  link: "/orders/1234",
  broadcast: true,
});

// Also send an email
await notify(userId, {
  type: "welcome",
  title: "Welcome!",
  body: "Thanks for signing up.",
  broadcast: true,
  mail: { subject: "Welcome to our platform", html: "<h1>Welcome!</h1>" },
});
```

## Database

Drizzle ORM with support for **SQLite**, **MySQL**, and **PostgreSQL** — just change `DATABASE_URL` and it auto-detects the dialect. Includes pagination, topological seeding, and migration hooks.

::: code-group

```ts [Hono]
import { db, paginateModel } from "@/framework/facade.js";

// Query
const posts = await db.query.posts.findMany({ with: { author: true } });
// Returns: { current_page, data, total, links, ... }
const result = await paginateModel(c, {
  findMany: (opts) => db.query.posts.findMany(opts),
  with: { author: true },
});
```

```ts [Express]
import { db, paginateModel } from "@/framework/facade.js";

// Query
const posts = await db.query.posts.findMany({ with: { author: true } });
// Returns: { current_page, data, total, links, ... }
const result = await paginateModel(req, {
  findMany: (opts) => db.query.posts.findMany(opts),
  with: { author: true },
});
```

:::

Seeders are auto-discovered and sorted by foreign key dependencies — no manual ordering needed.

## Authentication

JWT-based auth with signed HTTP-only cookies. Separate tokens for access and refresh, with automatic cross-origin cookie handling.

::: code-group

```ts [Hono]
import { jwt, cookie, password } from "@/framework/facade.js";

// Hash a password
const hash = await password.hashPassword("user-password");

// Verify
const valid = await password.verifyPassword("user-password", hash);

// Generate tokens — defaults: access 15 min, refresh 1 hour (config/jwt.ts)
const access = await jwt.generateToken({ userId: 1 }, "access");
const refresh = await jwt.generateToken({ userId: 1 }, "refresh");

// "Remember me" — refresh token lives 30 days
const remember = await jwt.generateToken({ userId: 1 }, "refresh", 2592000);

// Set cookies (handles SameSite automatically for cross-origin)

cookie.setAuth(c, access.token);
cookie.setRefresh(c, refresh.token);
```

```ts [Express]
import { jwt, cookie, password } from "@/framework/facade.js";

// Hash a password
const hash = await password.hashPassword("user-password");

// Verify
const valid = await password.verifyPassword("user-password", hash);

// Generate tokens — defaults: access 15 min, refresh 1 hour (config/jwt.ts)
const access = await jwt.generateToken({ userId: 1 }, "access");
const refresh = await jwt.generateToken({ userId: 1 }, "refresh");

// "Remember me" — refresh token lives 30 days
const remember = await jwt.generateToken({ userId: 1 }, "refresh", 2592000);

// Set cookies (handles SameSite automatically for cross-origin)

cookie.setAuth(res, access.token);
cookie.setRefresh(res, refresh.token);
```

:::

## Rate Limiting

Automatic rate limiting with a Redis-backed store that falls back to in-memory when Redis is unavailable. Includes a separate stricter limiter for login attempts.

```ts
// Applied globally via middleware — no code needed
// Uses session ID for authenticated users, IP for guests
// Returns standard RateLimit-* headers (draft-6)

// Login-specific limiter (applied automatically to login routes)
// 60 attempts per 60 seconds per IP
```

## Structured Logging

Pino-based structured JSON logging with colorized console output and rotating log files. Catches uncaught exceptions and unhandled rejections automatically.

```ts
import { logger } from "@/framework/facade.js";

logger.info("User signed in", { userId: 123, ip: "192.168.1.1" });
logger.error("Payment failed", { orderId: "abc", error: err.message });
```

Logs rotate at 10MB — 5 app log files and 3 fatal log files are kept.

## Self Deploy to VPS

Deploy directly from your terminal to any Linux VPS — no GitHub Actions, no CI/CD platform, no third-party service. Just SSH + Docker. Works on **Windows**, **Linux**, and **macOS** — the CLI uses `rsync` when available and falls back to `scp` automatically (including Windows with Git Bash / WSL).

::: code-group

```bash [npm]
# One-time: generate all Docker files
npm run maker deploy:init

# Edit deploy/workflow.remote.json with your server IP + SSH key
# Then deploy:
npm run maker deploy:workflow:remote
```

```bash [pnpm]
# One-time: generate all Docker files
pnpm maker deploy:init

# Edit deploy/workflow.remote.json with your server IP + SSH key
# Then deploy:
pnpm maker deploy:workflow:remote
```

```bash [yarn]
# One-time: generate all Docker files
yarn maker deploy:init

# Edit deploy/workflow.remote.json with your server IP + SSH key
# Then deploy:
yarn maker deploy:workflow:remote
```

```bash [bun]
# One-time: generate all Docker files
bun maker deploy:init

# Edit deploy/workflow.remote.json with your server IP + SSH key
# Then deploy:
bun maker deploy:workflow:remote
```

:::

That single command uploads your project via rsync, creates Docker networks, starts the database + Redis + nginx proxy, builds your app image, runs migrations, and starts the server — all over SSH.

What you get on the remote server:

| Component                | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| **nginx-proxy**          | Reverse proxy with auto Let's Encrypt SSL                        |
| **mysql / postgres**     | Database server (shared across apps)                             |
| **redis**                | Cache, queue, session, realtime backend                          |
| **pgAdmin / phpMyAdmin** | Database admin UIs                                               |
| **app container**        | Your app with supervisor managing API + queue worker + scheduler |
| **auto-migrate**         | Runs `db:migrate --seed` on first deploy (one-shot)              |

::: code-group

```bash [npm]
# Promote: test locally first, then deploy remote
npm run maker deploy:workflow:promote

# Import a database dump
npm run maker deploy:db:import:remote -- --file=deploy/nexwire.sql
```

```bash [pnpm]
# Promote: test locally first, then deploy remote
pnpm maker deploy:workflow:promote

# Import a database dump
pnpm maker deploy:db:import:remote --file=deploy/nexwire.sql
```

```bash [yarn]
# Promote: test locally first, then deploy remote
yarn maker deploy:workflow:promote

# Import a database dump
yarn maker deploy:db:import:remote --file=deploy/nexwire.sql
```

```bash [bun]
# Promote: test locally first, then deploy remote
bun maker deploy:workflow:promote

# Import a database dump
bun maker deploy:db:import:remote --file=deploy/nexwire.sql
```

:::

The system auto-detects your database dialect, package manager, and runtime — the generated Dockerfile works with npm, pnpm, yarn, and Bun. See [Deploy Overview](/deploy/overview) for the full architecture.

## Module System

Every feature is a self-contained module under `src/modules/<name>/`:

```
src/modules/posts/
├── __tests__/         # Unit testing
│   └── post.test.ts
├── console/           # CLI commands
│   └── post.ts
├── controllers/       # Request handlers
│   └── post.ts
├── database/
│   ├── models/        # Drizzle schema definitions
│   └── seeders/       # Test data
├── helpers/           # helper function for controller
│   └── post.ts
├── jobs/              # BullMQ queue handlers
│   └── post.ts
├── middlewares/       # module specific middleware
│   └── post.ts
├── routes/            # HTTP route definitions (auto-discovered)
│   └── index.ts
├── schemas/           # validation
│   └── post.ts
├── services/          # business logic for controller
│   └── post.ts
├── types/             # type define
│   └── post.ts
└── facade.ts          # front door to communicate one module to other module
```

Modules are auto-discovered — no manual registration needed. Create one with the CLI:

::: code-group

```bash [npm]
npm run maker module:make blog
npm run maker module:make-controller blog post
npm run maker module:make-route blog post
npm run maker module:make-model blog post
```

```bash [pnpm]
pnpm maker module:make blog
pnpm maker module:make-controller blog post
pnpm maker module:make-route blog post
pnpm maker module:make-model blog post
```

```bash [yarn]
yarn maker module:make blog
yarn maker module:make-controller blog post
yarn maker module:make-route blog post
yarn maker module:make-model blog post
```

```bash [bun]
bun maker module:make blog
bun maker module:make-controller blog post
bun maker module:make-route blog post
bun maker module:make-model blog post
```

:::

## Single Command Dev

The `dev` command starts everything you need at once:

::: code-group

```bash [npm]
npm run maker dev
```

```bash [pnpm]
pnpm maker dev
```

```bash [yarn]
yarn maker dev
```

```bash [bun]
bun maker dev
```

:::

| Component         | URL                              |
| ----------------- | -------------------------------- |
| API server        | `http://localhost:3000`          |
| API docs (Scalar) | `http://localhost:3000/api-docs` |
| Queue dashboard   | `http://localhost:3000/queues`   |
| Vue 3 UI (HMR)    | `http://localhost:5173`          |

## Pick Your Learning Path

Different developers have different learning styles. Feel free to pick a path that suits your preference.

<div class="vt-doc-intro-cards" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 20px;">
  <a href="/nexwire/guide/quick-start" style="display: block; padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none; color: inherit; transition: border-color 0.25s;">
    <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">Quick Start →</div>
    <div style="font-size: 14px; color: var(--vp-c-text-2);">Get a project running in under 5 minutes.</div>
  </a>
  <a href="/nexwire/guide/architecture" style="display: block; padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none; color: inherit; transition: border-color 0.25s;">
    <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">Read the Guide →</div>
    <div style="font-size: 14px; color: var(--vp-c-text-2);">Walk through every part of the framework in detail.</div>
  </a>
</div>
