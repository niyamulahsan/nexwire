# Routing

nexwire uses one of two HTTP engines for routing: **Hono** (default) or **Express**. Both are available from `create-nexwire` via `--engine=hono` or `--engine=express`. Routes are defined per module and auto-registered at startup.

The framework exposes the same facade (`createRoute`, `group`, `HttpStatusCodes`, `jsonContent`, ...) on both engines — only the request handler signature differs:

| Concern             | Hono                                   | Express                             |
| ------------------- | -------------------------------------- | ----------------------------------- |
| Handler signature   | `(c: Context)`                         | `(req: Request, res: Response)`     |
| Validated body      | `c.req.valid("json")`                  | `req.body`                          |
| Path param          | `c.req.param("id")`                    | `req.params.id`                     |
| Query param         | `c.req.query("page")`                  | `req.query.page`                    |
| JSON response       | `c.json(data, status)`                 | `res.status(status).json(data)`     |
| Middleware context  | `c.set("key", value)` / `c.get("key")` | `res.locals.key`                    |
| Types imported from | `"hono"` (`Handler`, `Context`)        | `"express"` (`Request`, `Response`) |

## Basic Route

Every route file exports a `group()` that collects route handlers:

```ts
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
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list"),
  },
});
```

The route definition is identical on both engines — only the handler changes:

::: code-group

```ts [Hono]
export default group().api(listRoute, (c) =>
  c.json([{ id: 1, title: "Hello" }]),
);
```

```ts [Express]
import type { Request, Response } from "express";

export default group().api(listRoute, (_req: Request, res: Response) =>
  res.json([{ id: 1, title: "Hello" }]),
);
```

:::

## Route Groups

Use `group()` to organize routes into logical groups with shared middleware — identical on both engines:

```ts
import { group } from "@/framework/facade.js";

// Public routes (no auth required)
const publicGroup = group().api(registerRoute, register).api(loginRoute, login);

// Protected routes (auth middleware applied)
const protectedGroup = group(authMiddleware)
  .api(listRoute, index)
  .api(showRoute, show);
```

`group(...)` is literally `createRouter().group(...)` — indistinguishable. These two statements are identical:

```ts
// Identical — pick either
export default group().api(listRoute, list);
export default createRouter().group().api(listRoute, list);
```

Use `createRouter()` directly only when a single file needs multiple independent groups composed together (e.g. public + protected under the same prefix via `.route()`):

| Pattern                            | Use case                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| `group(middleware)`                | Simple single-group export, no sub-grouping needed                 |
| `createRouter().group(middleware)` | Multiple independent groups in the same file (public vs protected) |

## Handlers

A handler receives the request and must return/send a response. Read the input, then respond:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const show: Handler = async (c) => {
  const id = c.req.param("id"); // path param
  const page = c.req.query("page"); // query param
  const data = { id, page }; // ... your logic
  return c.json(data, 200);
};
```

```ts [Express]
import type { Request, Response } from "express";

export const show = (req: Request, res: Response) => {
  const id = req.params.id; // path param
  const page = req.query.page; // query param
  const data = { id, page }; // ... your logic
  res.status(200).json(data);
};
```

:::

## OpenAPI Mode

When `OPEN_API=true`, routes use `createRoute()` with `.api()` for full OpenAPI documentation at `/api-docs` — shared by both engines:

```ts
const showRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Posts"],
  request: { params: PostIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(PostResponseSchema, "post details"),
  },
});

export default group().api(showRoute, show);
```

When `OPEN_API=false`, routes use plain verb methods without metadata — identical on both engines:

```ts
export default group()
  .get("/", index)
  .get("/:id", show)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

## Route Auto-Discovery

Routes are auto-discovered from `src/modules/*/routes/*.ts`. No manual registration needed.

## Generating Routes

::: code-group

```bash [npm]
npm run maker module:make-route blog post
```

```bash [pnpm]
pnpm maker module:make-route blog post
```

```bash [yarn]
yarn maker module:make-route blog post
```

```bash [bun]
bun maker module:make-route blog post
```

:::

This creates `src/modules/blog/routes/post.ts` and auto-links it to the most recently modified controller.

## Middleware

Apply middleware per-route or per-group (API identical on both engines):

```ts
import { group } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";

export default group(authMiddleware) // all routes require auth
  .api(listRoute, index)
  .api(showRoute, [requireRole("admin")], show); // only admin role
```

To create your own middleware, use the `middleware:make` CLI command and fill in the engine-specific signature — see [Middleware Commands](../cli/middleware):

### Generating Middleware

::: code-group

```bash [npm]
npm run maker middleware:make ratelimit
```

```bash [pnpm]
pnpm maker middleware:make ratelimit
```

```bash [yarn]
yarn maker middleware:make ratelimit
```

```bash [bun]
bun maker middleware:make ratelimit
```

:::

This creates `src/middlewares/ratelimit-middleware.ts` into middlewares folder.

::: code-group

```ts [Hono]
// src/middlewares/rate-limit-middleware.ts
import type { Context, Next } from "hono";
import { db } from "@/framework/facade.js";

export async function ratelimitMiddleware(c: Context, next: Next) {
  c.set("note", "checked"); // share data with handlers via c.get()
  return await next();
}
```

```ts [Express]
// src/middlewares/rate-limit-middleware.ts
import type { NextFunction, Request, Response } from "express";
import { db } from "@/framework/facade.js";

export function ratelimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.locals.note = "checked"; // share data with handlers via res.locals
  return next();
}
```

:::

## Built-in Middleware

The framework applies these globally in `src/framework/http/app.ts`:

| Middleware              | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `corsMiddleware`        | CORS headers                                                                       |
| `sessionMiddleware`     | Session cookie + ID                                                                |
| `rateLimiterMiddleware` | Global rate limiting                                                               |
| `loggerMiddleware`      | Request logging (when `loggingConfig.httpRequests` is true in `config/logging.ts`) |

## Request Validation

With OpenAPI enabled, validation is automatic via route schemas:

::: code-group

```ts [Hono]
// Controller receives validated data
import type { Handler } from "hono";

export const store: Handler = async (c) => {
  const body = c.req.valid("json"); // validated against CreateSchema
  // body is typed — no manual validation needed
};
```

```ts [Express]
// Controller receives validated data
import type { Request, Response } from "express";

export const store = (req: Request, res: Response) => {
  const body = req.body; // validated against CreateSchema
  // body is typed — no manual validation needed
};
```

:::

Without OpenAPI, use the `validate()` helper (identical on both engines):

::: code-group

```ts [Hono]
import { validate } from "@/framework/facade.js";

export const store: Handler = async (c) => {
  const body = await validate(CreatePostSchema, await c.req.json());
};
```

```ts [Express]
import { validate } from "@/framework/facade.js";

export const store = async (req: Request, res: Response) => {
  const body = await validate(CreatePostSchema, req.body);
};
```

:::

## File Uploads

Multipart parsing is engine-specific:

- **Hono** — `await c.req.parseBody()` returns the raw body; files arrive as `File` instances.
- **Express** — attach the `upload({ field })` / `fields()` facade middlewares to the route; files arrive as in-memory buffers on `req.file` / `req.files`.

::: code-group

```ts [Hono]
import type { Handler } from "hono";

// Hono controller file
export const upload: Handler = async (c: any) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File))
    return c.json({ message: "File is required" }, 422);

  const path = await storage.disk("public").putFile("uploads", file);
  return c.json({ path, url: storage.disk("public").url(path) });
};
```

```ts [Express]
// Express api file
import { upload } from "@/framework/facade.js";
import type { Request, Response } from "express";

export default group().api(
  uploadRoute,
  [upload({ field: "file", maxSize: 2 * 1024 * 1024 })],
  async (req: Request, res: Response) => {
    const file = req.file!; // in-memory buffer
    const path = await storage.disk("public").putFile("uploads", file);
    res.json({ path, url: storage.disk("public").url(path) });
  },
);
```

:::

See [Upload — Express only](/guide/support/upload) and [Storage: Multipart File Upload](/guide/storage#multipart-file-upload) for the full detail.

## UI Routes

UI routing uses Vue Router and is defined in `src/resources/src/router/`. See [UI > Router](/guide/resources/router) for details.
