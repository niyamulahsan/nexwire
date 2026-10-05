# Events & Queue

## Overview

**nexwire** uses **BullMQ** (backed by **Redis**) for background job processing. The event dispatcher ties together realtime broadcasting and queueing in a single `dispatchEvent()` call.

### How It Works

```
Controller                           BullMQ Worker
    │                                     │
    │  dispatchEvent("user:signup",       │
    │    payload, { queue: "mail" })      │
    │  ─────────────────────────────────> │
    │                                     │  shouldQueue("user:signup", "mail")
    │                                     │    → send email
    │                                     │    → dispatchEvent("admin.user.registered",
    │                                     │        payload, { broadcast: { roles: ["admin"] } })
    │                                     │                    │
    │                                     │                    ▼
    │                                     │           Socket.IO emits to
    │                                     │           all "role:admin" rooms
```

The framework **gracefully degrades** — if Redis is unavailable, `queueJob()` returns `null` and the queue system becomes a no-op. Your app never crashes from a missing Redis.

It is not silent, though. A `null` return means the job was **never queued and never ran**, so `queueJob()` warns once per queue and job name:

```text
[queue] Dropped job "orders.exported" on queue "reports". Redis is not available,
so this job was never queued and never ran. Enable REDIS in .env and run a queue
worker, or call dispatchCommand("orders.exported", payload) without
{ async: true } to run it in-process now.
```

The warning repeats for a different job, and for the same job name on a different queue, but not on every call — a job queued from a request hot path will not flood your log. If you would rather run that work immediately instead of dropping it, use [`dispatchCommand`](../api/dispatchCommand) without `{ async: true }`, which never touches the queue.

## Environment Variables

| Variable       | Default                  | Description                                 |
| -------------- | ------------------------ | ------------------------------------------- |
| `REDIS`        | `false`                  | Master toggle for all Redis-backed features |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Redis connection string                     |
| `REDIS_PREFIX` | `nexwire`                | Key prefix for BullMQ queues in Redis       |

## Queue Configuration

Queue settings live in `src/config/queue.ts`:

| Setting           | Default                              | Description                                 |
| ----------------- | ------------------------------------ | ------------------------------------------- |
| `queues`          | `["default", "mail", "maintenance"]` | Queue names                                 |
| `concurrency`     | `10`                                 | Worker concurrency per queue                |
| `autoPruneQueues` | `true`                               | Auto-remove stale key values                |
| `prefix`          | `{redisConfig.prefix}:queue`         | Redis key prefix for queues                 |
| `durablePrefix`   | `{redisConfig.prefix}:durable`       | Redis key prefix for durable queues         |
| `queueUi`         | `/queues`                            | BullBoard dashboard URL                     |
| `allowedEmails`   | `""`                                 | Comma-separated emails for dashboard access |

Set `REDIS=true` in `.env` to enable queues, caching, sessions, and the Socket.IO Redis adapter.

## Dispatching Events

The primary API is `dispatchEvent()`, imported from the facade:

```ts
import { dispatchEvent } from "@/framework/facade.js";
```

### Broadcast Only

Emits to connected Socket.IO clients, no background job:

```ts
await dispatchEvent(
  "post.published",
  { postId: 1, title: "Hello" },
  {
    broadcast: { all: true },
  },
);
```

### Queue Only

Enqueues a background job without broadcasting:

```ts
await dispatchEvent(
  "user:signup",
  { userId, email, name, password },
  {
    queue: "mail",
  },
);
```

The `queue` option accepts either `true` (uses `"default"` queue) or a queue name string (e.g. `"mail"`).

### Broadcast + Queue

Does both — emits immediately via Socket.IO _and_ enqueues a job:

```ts
await dispatchEvent("post.publish", body, {
  queue: true,
  broadcast: { all: true },
});
```

### Broadcast Targets

```ts
// All connected clients
broadcast: { all: true }

// All authenticated users
broadcast: { auth: true }

// Specific roles
broadcast: { roles: ["admin", "moderator"] }

// Specific users by ID
broadcast: { users: [1, 42, 99] }

// Custom Socket.IO rooms
broadcast: { rooms: ["room:chat:general"] }

// Combine multiple targets
broadcast: { roles: ["admin"], users: [userId] }
```

### `dispatchEvent()` Options

| Option            | Type                   | Default | Description                                                            |
| ----------------- | ---------------------- | ------- | ---------------------------------------------------------------------- |
| `queue`           | `boolean \| string`    | —       | `true` = enqueue to `"default"` queue; string = enqueue to named queue |
| `broadcast.all`   | `boolean`              | —       | Emit to **all** connected Socket.IO clients                            |
| `broadcast.auth`  | `boolean`              | —       | Emit to all **authenticated** clients (room `"auth"`)                  |
| `broadcast.roles` | `string[]`             | —       | Emit to clients in specific **role** rooms (e.g. `["admin"]`)          |
| `broadcast.users` | `(number \| string)[]` | —       | Emit to specific **user** rooms (e.g. `[42]` → room `"user:42"`)       |
| `broadcast.rooms` | `string[]`             | —       | Emit to arbitrary **custom** rooms (e.g. `["room:chat:general"]`)      |

All broadcast fields can be combined — `{ roles: ["admin"], users: [userId] }` emits to both.

### `queueJob()` Options

Use `queueJob()` directly when you need fine-grained control over job execution:

```ts
import { queueJob } from "@/framework/facade.js";

await queueJob(
  "process-image",
  { path: "/tmp/photo.jpg" },
  {
    queue: "images",
    delay: 30, // run 30 seconds from now
    attempts: 5, // retry up to 5 times
    priority: 10, // higher number = processed sooner
    jobId: "img-123", // custom unique ID (prevents duplicates)
    backoff: { type: "fixed", delay: 5000 }, // 5s between retries
    removeOnComplete: 500, // keep last 500 completed
    removeOnFail: 2000, // keep last 2000 failed
  },
);
```

| Option             | Type     | Default                                | Description                                                             |
| ------------------ | -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `queue`            | `string` | `"default"`                            | Which queue to enqueue into                                             |
| `delay`            | `number` | `0`                                    | Delay in **seconds** before the job becomes visible to workers          |
| `attempts`         | `number` | `3`                                    | Maximum retry attempts if the job fails                                 |
| `jobId`            | `string` | auto-generated                         | Custom job ID — useful for idempotency (same ID = duplicate prevention) |
| `priority`         | `number` | —                                      | Higher number = processed first (BullMQ priority ordering)              |
| `backoff`          | `object` | `{ type: "exponential", delay: 3000 }` | Retry backoff strategy. `type`: `"exponential"` or `"fixed"`            |
| `removeOnComplete` | `number` | `1000`                                 | Keep at most this many completed jobs for this queue                    |
| `removeOnFail`     | `number` | `5000`                                 | Keep at most this many failed jobs for this queue                       |

## Commands (Synchronous)

Use `command()` + `dispatchCommand()` for in-process synchronous handlers — no Redis needed:

```ts
import { command, dispatchCommand } from "@/framework/facade.js";

// Register (usually in a job file or boot script)
command("calculate-tax", async (payload) => {
  return { total: payload.subtotal * 1.1 };
});

// Dispatch (sync by default)
const result = await dispatchCommand("calculate-tax", { subtotal: 100 });

// Or force async via queue
await dispatchCommand("calculate-tax", { subtotal: 100 }, { async: true });
```

## Queue Handlers (Jobs)

Define job handlers in `src/modules/<module>/jobs/*.ts`. Each file registers a handler with `shouldQueue()` at module scope:

```ts
import { logger, shouldQueue } from "@/framework/facade.js";

shouldQueue("post.publish", "default", async (job) => {
  logger.info("Post publish job processed", { data: job.data });
  return { ok: true };
});
```

```ts
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, password, userId } = job.data;

  // Send email
  await mail.sendMail({
    to: email,
    subject: "Account Created",
    html: `<p>Welcome ${name}!</p>`,
  });

  // Notify admins via socket
  await dispatchEvent(
    "admin.user.registered",
    { userId, name, email },
    {
      broadcast: { roles: ["admin"] },
    },
  );

  // Notify the user via socket
  await dispatchEvent(
    "user.registered",
    { message: "Welcome!" },
    {
      broadcast: { users: [userId] },
    },
  );

  return { ok: true, userId };
});
```

### Job Registration Flow

1. `bootQueueJobs()` in `kernel.ts` discovers all `src/modules/**/jobs/*.{ts,js}` files
2. Each file is imported, executing `shouldQueue()` at the top level
3. The handler is stored in an in-memory map keyed by `"queueName:jobName"`
4. When a worker picks up a job, it looks up the handler by this key

### Default Job Options (from BullMQ)

| Option             | Value                       |
| ------------------ | --------------------------- |
| Retry attempts     | 3                           |
| Backoff            | Exponential, starting at 3s |
| Remove on complete | Keep last 1000              |
| Remove on fail     | Keep last 5000              |

Override per-job when calling `queueJob()` directly.

## Running Workers

Start the worker process to process queued jobs:

::: code-group

```bash [npm]
npm run maker queue:work --queue=default,mail --prod --runtime=bun
```

```bash [pnpm]
pnpm maker queue:work --queue=default,mail --prod --runtime=bun
```

```bash [yarn]
yarn maker queue:work --queue=default,mail --prod --runtime=bun
```

```bash [bun]
bun maker queue:work --queue=default,mail --prod --runtime=bun
```

:::

- `--queue` specifies comma-separated queue names (defaults to `"default"`)
- `--prod` uses compiled `dist/` code
- `--runtime` chose between `node` or `bun`

The worker process:

1. Connects to Redis
2. Auto-discovers and imports all job files
3. Creates BullMQ `Worker` instances (concurrency: 10)
4. Processes jobs as they arrive
5. Logs completion and failure to console

## BullMQ Dashboard

When Redis is enabled, BullBoard is auto-mounted at `/queues`.

Access is gated by `allowedEmails` in `src/config/queue.ts` — set a comma-separated list of emails whose JWT-authenticated users can view the dashboard:

```bash
allowedEmails="admin@example.com,dev@example.com"
```

## Graceful Degradation

When `REDIS=false` or Redis is unreachable:

- `queueJob()` returns `null` — no crash, and it warns once per job so the lost work is visible
- `getQueue()` returns `null`
- BullBoard shows "unavailable"

This lets you develop with SQLite and no Redis, then add Redis later for production.

Note what this does *not* give you. A job that was dropped is gone: it is not retried, not persisted, and not visible to BullBoard. If your work must survive a restart — or must not run on the request thread — the only fix is Redis. For work that does not need to survive anything, use [`dispatchCommand`](../api/dispatchCommand) without `{ async: true }`.

## Queue Commands

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `maker queue:work`  | Start worker process            |
| `maker queue:clear` | Clear all queue keys from Redis |

## Controller Example

A complete flow: route → controller → queue → handler → broadcast.

### 1. Schema & Controller

When `OPEN_API=true`, schemas use the extended Zod (with `.openapi()` metadata) from the facade:

```ts
// under controller folder *.schema.ts file

import { z } from "@/framework/facade.js";

export const PublishPostSchema = z.object({
  title: z.string().min(1).openapi({ example: "Hello World" }),
  content: z.string().min(1),
  authorId: z.number(),
});
```

When `OPEN_API=false`, use plain Zod from the facade:

```ts
// under controller folder *.schema.ts file

import { z } from "@/framework/facade.js";

export const PublishPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  authorId: z.number(),
});
```

::: code-group

```ts [Hono]
// under controller folder *.controller.ts file

import type { Handler } from "hono";
import { dispatchEvent } from "@/framework/facade.js";

export const publishPost: Handler = async (c: any) => {
  const body = c.req.valid("json");

  // Queue the heavy work — response is instant
  await dispatchEvent("post.publish", body, { queue: "default" });

  return c.json({ message: "Post queued for publishing" }, 202);
};

export const broadcastStatus: Handler = async (c: any) => {
  const body = c.req.valid("json");

  // Broadcast directly to Socket.IO clients
  await dispatchEvent("system.status", body, {
    broadcast: { roles: ["admin"] },
  });

  return c.json({ message: "Status broadcast to admins" });
};

export const notifyUser: Handler = async (c: any) => {
  const { userId, message } = c.req.valid("json");

  // Notify a specific user via socket
  await dispatchEvent(
    "user.notification",
    { message },
    {
      broadcast: { users: [userId] },
    },
  );

  return c.json({ message: "Notification sent" });
};
```

```ts [Express]
// under controller folder *.controller.ts file

import type { Request, Response } from "express";
import { dispatchEvent } from "@/framework/facade.js";

export const publishPost = (req: Request, res: Response) => {
  const body = req.body;

  // Queue the heavy work — response is instant
  void dispatchEvent("post.publish", body, { queue: "default" });

  res.status(202).json({ message: "Post queued for publishing" });
};

export const broadcastStatus = (req: Request, res: Response) => {
  const body = req.body;

  // Broadcast directly to Socket.IO clients
  void dispatchEvent("system.status", body, {
    broadcast: { roles: ["admin"] },
  });

  res.json({ message: "Status broadcast to admins" });
};

export const notifyUser = (req: Request, res: Response) => {
  const { userId, message } = req.body;

  // Notify a specific user via socket
  void dispatchEvent(
    "user.notification",
    { message },
    {
      broadcast: { users: [userId] },
    },
  );

  res.json({ message: "Notification sent" });
};
```

:::

### 2. Route

```ts
// under route folder *.api.ts file

import {
  createRoute,
  createRouter,
  HttpStatusCodes,
  jsonContent,
  z,
} from "@/framework/facade.js";
import { PublishPostSchema } from "../controllers/post.schema.js";
import {
  publishPost,
  broadcastStatus,
  notifyUser,
} from "../controllers/post.controller.js";

const publishRoute = createRoute({
  path: "/posts/publish",
  method: "post",
  tags: ["Posts"],
  request: { body: jsonContent(PublishPostSchema, "Post data") },
  responses: {
    [HttpStatusCodes.ACCEPTED]: jsonContent(
      z.object({ message: z.string() }),
      "Queued",
    ),
  },
});

const statusRoute = createRoute({
  path: "/posts/status",
  method: "post",
  tags: ["Posts"],
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ message: z.string() }),
      "Broadcast",
    ),
  },
});

const notifyRoute = createRoute({
  path: "/posts/notify",
  method: "post",
  tags: ["Posts"],
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ message: z.string() }),
      "Sent",
    ),
  },
});

export default createRouter()
  .api(publishRoute, publishPost)
  .api(statusRoute, broadcastStatus)
  .api(notifyRoute, notifyUser);
```

### 3. Queue Handler

```ts
// under jobs folder *.ts file

import { dispatchEvent, shouldQueue } from "@/framework/facade.js";

shouldQueue("post.publish", "default", async (job) => {
  const { title, content, authorId } = job.data;

  // Heavy work — image processing, generate thumbnails, update search index
  // await processImages(content);
  // await updateSearchIndex(title, content);

  // Broadcast completion after work succeeds
  await dispatchEvent(
    "post.published",
    { title, status: "live" },
    {
      broadcast: { auth: true },
    },
  );

  // Notify the author specifically
  await dispatchEvent(
    "user.notification",
    {
      message: `Your post "${title}" is live!`,
    },
    {
      broadcast: { users: [authorId] },
    },
  );

  return { ok: true };
});
```

### 4. Client-Side

The UI uses the **Pulse** plugin (a wrapper around `socket.io-client`) to listen for broadcast events:

```ts
import { pulse } from "@/plugins/pulse";

// Listen on a channel (room) — auto-connects to Socket.IO
const channel = pulse.channel("user:42");
channel.listen("post.published", (data) => {
  appendToFeed(data);
});
channel.listen("user.notification", (data) => {
  showToast(data.message);
});

// Stop listening when leaving the page
onUnmounted(() => {
  channel.stopListening("post.published");
  channel.stopListening("user.notification");
});
```

## Recommended Pattern

Queue the work first, then broadcast results from the handler (as shown above). This ensures:

- The HTTP response is fast (just queues, no heavy work)
- Broadcasts happen _after_ the work is complete
- If the worker fails, the broadcast never fires — no false positives
