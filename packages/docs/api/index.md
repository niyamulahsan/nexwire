# API Reference

Every reusable framework capability is exposed through **one import** — the facade at `@/framework/facade.js`. You never reach into framework internals; if it is not on this page, it is not part of the public API.

::: code-group

```ts [Hono]
import {
  createRouter, // router builder
  createRoute, // OpenAPI route declaration
  group, // middleware grouping shorthand
  z, // Zod + .openapi() schemas
  jsonContent, // JSON media-type wrapper
  HttpStatusCodes, // status constants
  validate, // schema validation outside routes
  database, // init/access the Drizzle instance
  db, // global query proxy
  paginate, // request-driven pagination
  paginateModel, // eager-loading pagination
  paginateQuery, // custom count/data pagination
  paginateTable, // single-table pagination
  cache, // Redis key-value cache
  command, // register in-process handler
  dispatchCommand, // run an in-process handler
  dispatchEvent, // broadcast and/or enqueue an event
  queue, // access a BullMQ queue
  queueJob, // enqueue a background job
  shouldQueue, // register a job handler
  broadcast, // Socket.IO broadcast
  defineSchedule, // named cron schedules
  session, // server-side sessions
  storage, // file storage
  notify, // persisted + realtime notifications
  password, // bcrypt hashing
  jwt, // token generation/verification
  cookie, // auth cookie helpers
  mail, // SMTP transport
  logger, // structured logging
  urls, // absolute URL building
  lodash, // full Lodash library
} from "@/framework/facade.js";
```

```ts [Express]
import {
  createRouter, // router builder
  createRoute, // OpenAPI route declaration
  group, // middleware grouping shorthand
  z, // Zod + .openapi() schemas
  jsonContent, // JSON media-type wrapper
  HttpStatusCodes, // status constants (curated subset)
  validate, // schema validation outside routes
  database, // init/access the Drizzle instance
  db, // global query proxy
  paginate, // request-driven pagination
  paginateModel, // eager-loading pagination
  paginateQuery, // custom count/data pagination
  paginateTable, // single-table pagination
  cache, // Redis key-value cache
  command, // register in-process handler
  dispatchCommand, // run an in-process handler
  dispatchEvent, // broadcast and/or enqueue an event
  queue, // access a BullMQ queue
  queueJob, // enqueue a background job
  shouldQueue, // register a job handler
  broadcast, // Socket.IO broadcast
  defineSchedule, // named cron schedules
  session, // server-side sessions
  storage, // file storage
  notify, // persisted + realtime notifications
  password, // bcrypt hashing
  jwt, // token generation/verification
  cookie, // auth cookie helpers
  mail, // SMTP transport
  logger, // structured logging
  urls, // absolute URL building
  lodash, // full Lodash library
  fields, // multer-driven multipart fields
  upload, // multer-driven file upload middleware
} from "@/framework/facade.js";
```

:::

The difference between engines is **only** `upload`/`fields` — the Hono engine parses multipart natively via `c.req.parseBody()`, so it has no multer helpers. See [Upload](./upload) and the [Upload guide](../guide/support/upload).

> **Express engine** additionally exports `upload` and `fields` — multipart parsing middleware built on `multer`. See [Upload](./upload) and the [Upload guide](./../guide/support/upload). The Hono engine parses multipart natively via `c.req.parseBody()`.

## Function reference

Each facade function has its own page. Every export below is a documented part of the public API.

| Function                               | Purpose                                              | Guide                                                         |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| [`createRouter`](./createRouter)       | Router with group/route/api helpers                  | [Routing](./../guide/routing) · [OpenAPI](./../guide/openapi) |
| [`createRoute`](./createRoute)         | Declare a documented OpenAPI route                   | [Routing](./../guide/routing) · [OpenAPI](./../guide/openapi) |
| [`group`](./group)                     | `createRouter().group()` shorthand + role middleware | [Routing](./../guide/routing)                                 |
| [`z`](./z)                             | Extended Zod with `.openapi()`                       | [OpenAPI](./../guide/openapi)                                 |
| [`jsonContent`](./jsonContent)         | Wrap a schema as `application/json`                  | [OpenAPI](./../guide/openapi)                                 |
| [`HttpStatusCodes`](./HttpStatusCodes) | Numeric HTTP status constants                        | [OpenAPI](./../guide/openapi)                                 |
| [`validate`](./validate)               | Run a Zod schema → throws `422` on mismatch          | [OpenAPI](./../guide/openapi)                                 |
| [`database`](./database)               | Returns the initialized Drizzle instance             | [Database](./../guide/database)                               |
| [`db`](./db)                           | Global Drizzle query proxy                           | [Database](./../guide/database)                               |
| [`paginate`](./paginate)               | Request-driven pagination (joins, aggregates)        | [Database](./../guide/database)                               |
| [`paginateModel`](./paginateModel)     | Eager-loading pagination (`db.query…findMany with`)  | [Database](./../guide/database)                               |
| [`paginateQuery`](./paginateQuery)     | Manual `total()`/`data()` pagination                 | [Database](./../guide/database)                               |
| [`paginateTable`](./paginateTable)     | Single-table pagination, no request object           | [Database](./../guide/database)                               |
| [`cache`](./cache)                     | Redis key-value cache (graceful fallback)            | [Cache](./../guide/cache)                                     |
| [`command`](./command)                 | Register an in-process synchronous handler           | [Events & Queue](./../guide/events-queue)                     |
| [`dispatchCommand`](./dispatchCommand) | Run a registered command (async: enqueue)            | [Events & Queue](./../guide/events-queue)                     |
| [`dispatchEvent`](./dispatchEvent)     | Broadcast + enqueue a domain event                   | [Events & Queue](./../guide/events-queue)                     |
| [`queue`](./queue)                     | Access a BullMQ queue instance                       | [Events & Queue](./../guide/events-queue)                     |
| [`queueJob`](./queueJob)               | Enqueue a background job                             | [Events & Queue](./../guide/events-queue)                     |
| [`shouldQueue`](./shouldQueue)         | Register a job handler (optionally durable)          | [Events & Queue](./../guide/events-queue)                     |
| [`broadcast`](./broadcast)             | Socket.IO emit to targeted audiences                 | [Realtime](./../guide/realtime)                               |
| [`defineSchedule`](./defineSchedule)   | Named cron tasks with distributed locking            | [Scheduler](./../guide/scheduler)                             |
| [`session`](./session)                 | Redis-backed server-side sessions                    | [Session](./../guide/session)                                 |
| [`storage`](./storage/)                | Local + S3-compatible file storage                   | [Storage](/guide/storage)                                     |
| [`notify`](./notify)                   | Persist + broadcast + email notifications            | [Notifications](./../guide/notification)                      |
| [`password`](./password)               | bcrypt hash / verify                                 | [Password](./../guide/support/password)                       |
| [`jwt`](./jwt)                         | HS256 token generation / verification                | [JWT](./../guide/support/jwt)                                 |
| [`cookie`](./cookie)                   | `{name}_access` / `{name}_refresh` cookie helpers    | [Cookie](./../guide/support/cookie)                           |
| [`mail`](./mail)                       | SMTP `sendMail` transport                            | [Mail](./../guide/support/mail)                               |
| [`logger`](./logger)                   | Leveled structured logging + rotating files          | [Logger](./../guide/support/logger)                           |
| [`urls`](./urls)                       | Absolute URL building from `APP_URL`                 | [URL](./../guide/support/url)                                 |
| [`upload`](./upload)                   | File upload middleware (Express only, `multer`)      | [Upload](./../guide/support/upload)                           |
| [`lodash`](./lodash)                   | Full Lodash re-export                                | [libraries](./../guide/others/string)                         |

## When do I use which?

- **HTTP & OpenAPI** — `createRouter`/`group` build the router; `createRoute` documents a route; `z` writes the schemas; `jsonContent` + `HttpStatusCodes` describe responses.
- **Input safety** — `validate` runs a schema anywhere (outside routes) and throws a structured `422` on failure.
- **Data** — `db` is the Drizzle client; `paginate` / `paginateModel` / `paginateQuery` / `paginateTable` wrap queries in a Laravel-style page (see the [Which one?](./paginate) table).
- **Caching** — `cache` stores JSON with TTL and degrades to a no-op when Redis is off.
- **Background work** — `command`/`dispatchCommand` run in-process handlers; `dispatchEvent` fans out to sockets and/or queues; `queueJob`/`shouldQueue` are the raw BullMQ surface.
- **Realtime** — `broadcast` emits a Socket.IO event to targeted audiences.
- **Automation** — `defineSchedule` runs cron tasks with distributed locking.
- **State & files** — `session` keeps server-side state; `storage` reads/writes files on local disk or S3.
- **User-visible events** — `notify` persists a notification row and optionally broadcasts + emails it.
- **Support** — `password`, `jwt`, `cookie`, `mail` power auth flows; `logger` is the structured logger; `urls` builds absolute links; `lodash` re-exports the full library.

## Common recipes

### Sign up a user with hashed password + realtime + email

The auth flow composes hashing, persistence, and dispatch:

```ts
import { db, password, dispatchEvent, notify } from "@/framework/facade.js";
import * as schema from "@/database/schema.js";

export const register = async (input: {
  name: string;
  email: string;
  password: string;
}) => {
  const user = await db.insert(schema.users).values({
    name: input.name,
    email: input.email,
    password: await password.hashPassword(input.password),
  });

  await notify(user.id, {
    type: "success",
    title: "Welcome",
    body: "Your account is ready.",
    broadcast: true,
    mail: { subject: "Welcome to nexwire" },
  });

  await dispatchEvent(
    "user.registered",
    { userId: user.id },
    { broadcast: { roles: ["admin"] } },
  );

  return user;
};
```

### List a paginated resource

Route + controller compose routing, querying, and pagination:

::: code-group

```ts [Hono]
import {
  createRoute,
  createRouter,
  group,
  HttpStatusCodes,
  jsonContent,
  db,
  paginate,
  z,
} from "@/framework/facade.js";
import { desc } from "drizzle-orm";
import { posts } from "@/modules/blog/database/models/post.js";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list of posts"),
  },
});

export default createRouter()
  .group()
  .api(listRoute, async (c) => {
    const query = db.select().from(posts).orderBy(desc(posts.id));
    return c.json(await paginate(c, query, 15));
  });
```

```ts [Express]
import {
  createRoute,
  createRouter,
  group,
  HttpStatusCodes,
  jsonContent,
  db,
  paginate,
  z,
} from "@/framework/facade.js";
import type { Request, Response } from "express";
import { desc } from "drizzle-orm";
import { posts } from "@/modules/blog/database/models/post.js";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list of posts"),
  },
});

export default createRouter()
  .group()
  .api(listRoute, async (req: Request, res: Response) => {
    const query = db.select().from(posts).orderBy(desc(posts.id));
    res.json(await paginate(req, query, 15));
  });
```

:::

### Throttle background work and broadcast the result

`queueJob` + `shouldQueue` handle heavy work; `broadcast` surfaces the outcome:

```ts
import { queueJob, shouldQueue, broadcast } from "@/framework/facade.js";

// Controller: queue it, respond fast
await queueJob("process-image", { path }, { queue: "images", delay: 5 });

// Worker: register handler, then notify the author
shouldQueue("process-image", "images", async (job) => {
  const url = await processImage(job.data.path);
  broadcast("image.processed", { url }, { users: [job.data.userId] });
});
```

## Rules of the facade

- **One import** — everything importable lives on `@/framework/facade.js`; the facade only re-exports what is implemented. If a function is missing here, it does not exist yet.
- **Graceful degradation** — Redis-backed features (`cache`, `session`, `queue`, `broadcast` via adapter) return `null`/`false`/`fallback` when Redis is unavailable instead of throwing.
- **Namespaces over bare functions** — grouped utilities (`cache`, `session`, `storage`, `jwt`, `cookie`, `password`, `mail`, `urls`, `lodash`) keep call sites searchable and collide-proof.
- **Compose, don't re-implement** — features are built by combining the exports above (see the pagination helpers, which all share one `PaginatedResult` shape).
