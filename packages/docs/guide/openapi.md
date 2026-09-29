# OpenAPI

nexwire has built-in OpenAPI 3.0 support so your routes automatically generate an interactive API documentation UI at `/api-docs` using Scalar. The engine underneath depends on your HTTP engine: the **Hono** engine uses `@hono/zod-openapi` + `stoker`, the **Express** engine uses `@asteasolutions/zod-to-openapi` + `@scalar/express-api-reference`. Either way, you write routes with the same facade helpers (`createRoute`, `z`, `jsonContent`) and get the docs for free.

## Enable / Disable

Set `OPEN_API` in `.env`:

```bash
OPEN_API=true   # /api-docs + /doc enabled
OPEN_API=false  # bare API, no docs endpoints
```

Routes still work when disabled — only the documentation endpoints are removed.

## Endpoints

| Endpoint       | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `/api-docs`    | Scalar interactive API docs UI (moon theme)                              |
| `/doc`         | OpenAPI 3.0.0 JSON spec                                                  |
| `/favicon.ico` | API favicon (from `src/resources/src/assets/images/favicon/favicon.ico`) |

## How It Works

When `OPEN_API=true` and a route is registered via `.api()`, the framework collects its path/method/schemas into an OpenAPI document. On **Hono** it builds an `OpenAPIHono` router; on **Express** it registers the path in a `zod-to-openapi` registry. Both serve the spec at `/doc` and the Scalar UI at `/api-docs`:

::: code-group

```ts [Hono]
import {
  createRoute,
  z,
  HttpStatusCodes,
  jsonContent,
  group,
} from "@/framework/facade.js";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  summary: "List all posts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list of posts"),
  },
});

export default group().api(listRoute, async (c) => {
  const posts = await db.query.posts.findMany();
  return c.json(posts);
});
```

```ts [Express]
import {
  createRoute,
  z,
  HttpStatusCodes,
  jsonContent,
  group,
} from "@/framework/facade.js";
import type { Request, Response } from "express";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  summary: "List all posts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list of posts"),
  },
});

export default group().api(listRoute, async (_req: Request, res: Response) => {
  const posts = await db.query.posts.findMany();
  res.json(posts);
});
```

:::

This route appears in the Scalar UI at `/api-docs` with full request/response schemas.

## Without OpenAPI

When `OPEN_API=false`, use plain verb methods:

```ts
import { group } from "@/framework/facade.js";

export default group()
  .get("/", index)
  .get("/:id", show)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

No documentation is generated, but the routes still work exactly the same way. If you want to test the api, in this case you can use postman or requestly.

## Defining Schemas

Schemas are Zod objects with `.openapi()` metadata for docs:

```ts
import { z } from "@/framework/facade.js"; // extended with .openapi() on both engines

export const PostSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    title: z.string().min(1).openapi({ example: "Hello World" }),
    body: z.string().optional(),
    createdAt: z.string().openapi({ example: "2024-01-15T08:30:00.000Z" }),
  })
  .openapi("Post");

export const CreatePostSchema = z.object({
  title: z.string().min(1).openapi({ example: "New Post" }),
  body: z.string().optional(),
});
```

## Defining Routes

Each route specifies path, method, tags, request schemas, and response schemas:

```ts
import {
  createRoute,
  z,
  HttpStatusCodes,
  jsonContent,
} from "@/framework/facade.js";
import { PostSchema } from "@/modules/post/controllers/post.schema.js";

// List route
const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Posts"],
  summary: "List all posts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "list of posts"),
  },
});

// Show route
const showRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Posts"],
  summary: "Get a post by ID",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({ example: 1 }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(PostSchema, "post details"),
    [HttpStatusCodes.NOT_FOUND]: {
      description: "Post not found",
    },
  },
});

// Store route
const storeRoute = createRoute({
  path: "/",
  method: "post",
  tags: ["Posts"],
  summary: "Create a new post",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreatePostSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(PostSchema, "created post"),
  },
});
```

## Registering Routes

Use `.api()` on the group to register OpenAPI-documented routes:

```ts
export default group()
  .api(listRoute, index)
  .api(showRoute, show)
  .api(storeRoute, store);
```

## Per-Route Middleware

Apply middleware to specific routes:

```ts
import { group } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";

export default group(authMiddleware)
  .api(listRoute, index)
  .api(showRoute, [requireRole("admin")], show);
```

## Group Routes

Use `group()` to create a router with shared middleware, then chain `.api()` calls for multiple routes. This keeps related routes together with the same auth/access rules:

```ts
import {
  createRoute,
  createRouter,
  HttpStatusCodes,
  jsonContent,
  z,
} from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";
import { RoleSchema } from "@/modules/auth/controllers/auth.schema.js";

const listRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Role"],
  summary: "List all roles",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(RoleSchema), "role list"),
  },
});

const showRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Role"],
  summary: "Get a role by ID",
  request: {
    params: z.object({ id: z.coerce.number().openapi({ example: 1 }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(RoleSchema, "role details"),
    [HttpStatusCodes.NOT_FOUND]: { description: "Role not found" },
  },
});

// Group: authMiddleware applies to ALL routes, requireRole per-route
export default createRouter()
  .group(authMiddleware)
  .api(listRoute, [requireRole("admin")], list)
  .api(showRoute, [requireRole("admin")], show);
```

### Public vs Protected Groups

Split routes into separate groups with different middleware:

```ts
import {
  createRouter,
  createRoute,
  HttpStatusCodes,
  jsonContent,
} from "@/framework/facade.js";
import {
  RegisterSchema,
  UserSchema,
} from "@/modules/auth/controllers/auth.schema.js";
import { loginLimiter } from "@/framework/http/ratelimiter.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";

const registerRoute = createRoute({
  path: "/register",
  method: "post",
  tags: ["Auth"],
  summary: "Register a new user",
  request: { body: jsonContent(RegisterSchema, "register payload") },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(AuthResponseSchema, "registered"),
  },
});

const meRoute = createRoute({
  path: "/me",
  method: "get",
  tags: ["Auth"],
  summary: "Get authenticated user",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(UserSchema, "current user"),
  },
});

// Public routes: rate-limited, no auth
const publicRoutes = createRouter()
  .group(loginLimiter)
  .api(registerRoute, register);

// Protected routes: require authentication
const protectedRoutes = createRouter().group(authMiddleware).api(meRoute, me);

// Combine both groups under the same prefix
export default createRouter()
  .route("/", publicRoutes)
  .route("/", protectedRoutes);
```

### `group()` vs `createRouter().group()`

These two statements are identical — `group(...)` is literally `createRouter().group(...)`:

```ts
// Identical — pick either
export default group().api(meRoute, me);
export default createRouter().group().api(meRoute, me);
```

| Pattern                            | Use case                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| `group(middleware)`                | Simple single-group export, no sub-grouping needed                 |
| `createRouter().group(middleware)` | Multiple independent groups in the same file (public vs protected) |

Both return the same router type — the difference is whether you need one group or multiple groups to compose together.

## Request Validation

With OpenAPI enabled, request validation is automatic. The handler receives typed, validated data:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const store: Handler = async (c: any) => {
  const body = c.req.valid("json"); // validated against CreatePostSchema
  // body is typed — no manual validation needed
};
```

```ts [Express]
import type { Request, Response } from "express";

export const store = (req: Request, res: Response) => {
  const body = req.body; // validated against CreatePostSchema
  // body is typed — no manual validation needed
};
```

:::

Without OpenAPI, use the `validate()` helper manually:

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { validate } from "@/framework/facade.js";

export const store: Handler = async (c: any) => {
  const body = await validate(CreatePostSchema, await c.req.json());
};
```

```ts [Express]
import type { Request, Response } from "express";
import { validate } from "@/framework/facade.js";

export const store = async (req: Request, res: Response) => {
  const body = await validate(CreatePostSchema, req.body);
};
```

:::

## Health Endpoint

The `/health` endpoint is also documented when OpenAPI is enabled:

```json
{
  "message": "Application is healthy"
}
```

## Customizing the API Info

Edit `src/config/openapi.ts` to change the API title, version, description, or Scalar UI settings:

```ts
// src/config/openapi.ts
export const openApiConfig = {
  version: "3.0.0",
  title: "My API",
  apiVersion: "1.0.0",
  description: "Description of your API",

  scalar: {
    specUrl: "/doc",
    docsPath: "/api-docs", // change this to rename the docs URL
    layout: "classic", // "classic" or "modern"
    theme: "moon", // "default" | "moon" | "purple" | "solarized" | "bluePlanet" | "fastify" | "kepler" | "mars" | "nebula" | "none"
    pageTitle: "My API Documentation",
    favicon: "src/resources/src/assets/images/favicon/favicon.ico", // served at /favicon.ico for the docs page
    defaultHttpClient: {
      targetKey: "js",
      clientKey: "fetch",
    },
    defaultOpenAllTags: true,
  },
} as const;
```

The framework reads this config automatically — no code changes needed. Set `scalar.favicon` to a project-relative icon path to change the favicon served at `/favicon.ico`; set it to `""` to disable the route.

## Toggling in Deploy

The `OPEN_API` flag is carried into deploy environments. `deploy:init` reads it from your `.env` and writes it into `deploy/.env.example`:

```bash
# deploy/.env.example
OPEN_API=false  # set to true in development, false in production
```
