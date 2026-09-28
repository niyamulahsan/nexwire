# Modules

Every module lives in `src/modules/<module-name>` and can contain:

```
src/modules/<module>/
├── controllers/
├── routes/
├── database/
│   ├── models/
│   └── seeders/
├── jobs/
└── console/
```

## Creating a Module

::: code-group

```bash [npm]
npm run maker module:make blog
```

```bash [pnpm]
pnpm maker module:make blog
```

```bash [yarn]
yarn maker module:make blog
```

```bash [bun]
bun maker module:make blog
```

:::

## Adding Components

::: code-group

```bash [npm]
npm run maker module:make-controller blog post
npm run maker module:make-route blog post
npm run maker module:make-model blog post
npm run maker module:make-seeder blog post
npm run maker module:make-job blog process-comment
npm run maker module:make-console blog cleanup
```

```bash [pnpm]
pnpm maker module:make-controller blog post
pnpm maker module:make-route blog post
pnpm maker module:make-model blog post
pnpm maker module:make-seeder blog post
pnpm maker module:make-job blog process-comment
pnpm maker module:make-console blog cleanup
```

```bash [yarn]
yarn maker module:make-controller blog post
yarn maker module:make-route blog post
yarn maker module:make-model blog post
yarn maker module:make-seeder blog post
yarn maker module:make-job blog process-comment
yarn maker module:make-console blog cleanup
```

```bash [bun]
bun maker module:make-controller blog post
bun maker module:make-route blog post
bun maker module:make-model blog post
bun maker module:make-seeder blog post
bun maker module:make-job blog process-comment
bun maker module:make-console blog cleanup
```

:::

## OpenAPI Mode

The generated controller, route, and schema files adapt to your `OPEN_API` environment variable. The CLI reads `process.env.OPEN_API` at scaffold time (`env-db.mjs:openApiEnabled()`) and selects the appropriate stub templates.

| Aspect                    | `OPEN_API=true`                                                                                                                                              | `OPEN_API=false` (default)                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Controller validation** | `c.req.valid("param")` / `c.req.valid("json")` (Hono) or `req.body` / validated route parts (Express) — driven by the route schema                          | `await validate(Schema, data)` — manual validation call via `@/framework/facade.js` |
| **Schema file**           | Full set: `ItemSchema`, `CreateSchema`, `UpdateSchema`, `IdParamsSchema`, response schemas (`ListResponse`, `Response`, `Message`) | Minimal: only `CreateSchema`, `UpdateSchema`, `IdParamsSchema` (input-only)         |
| **Route file**            | Uses `createRoute()` with `.api()` — each route has metadata (path, method, tags, request params/body, response codes)             | Uses direct verb methods `.get("/:id", handler)` — no metadata, no response schemas |
| **Controller imports**    | No validation import needed                                                                                                        | `import { validate } from "@/framework/facade.js"`                                  |
| **Generated API docs**    | Routes appear in Scalar UI at `/api-docs` with full request/response schemas                                                       | No auto-generated documentation                                                     |

### OPEN_API=true — OpenAPI Stubs

**Controller** (`controller/openapi.ts.stub`):

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const show: Handler = async (c: any) => {
  const params = c.req.valid("param");
  return c.json({
    message: "Post fetched successfully",
    data: { id: params.id, name: "" },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";

export const show = (req: Request, res: Response) => {
  const id = req.params.id; // validated by route schema
  res.json({
    message: "Post fetched successfully",
    data: { id, name: "" },
  });
};
```

:::

Validation comes from the route definition — the controller simply accesses validated data.

**Route** (`route/api.ts.stub`):

```ts
import {
  createRoute,
  group,
  HttpStatusCodes,
  jsonContent,
} from "@/framework/facade.js";

const showRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Blog"],
  request: { params: PostIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(PostResponseSchema, "post details"),
  },
});

export default group().api(showRoute, show);
```

**Schema** (`controller/schema.ts.stub`):

```ts
export const PostItemSchema = z.object({ id: z.number(), name: z.string() });
export const PostResponseSchema = z.object({
  message: z.string(),
  data: PostItemSchema,
});
// + CreateSchema, UpdateSchema, IdParamsSchema, ListResponseSchema, MessageSchema
```

### OPEN_API=false — Plain Stubs

**Controller** (`controller/plain.ts.stub`):

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { validate } from "@/framework/facade.js";
import {
  CreatePostSchema,
  UpdatePostSchema,
  PostIdParamsSchema,
} from "./post.schema.js";

export const show: Handler = async (c: any) => {
  const params = await validate(PostIdParamsSchema, c.req.param());
  return c.json({
    message: "Post fetched successfully",
    data: { id: params.id, name: "" },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";
import { validate } from "@/framework/facade.js";
import {
  CreatePostSchema,
  UpdatePostSchema,
  PostIdParamsSchema,
} from "./post.schema.js";

export const show = async (req: Request, res: Response) => {
  const params = await validate(PostIdParamsSchema, req.params);
  res.json({
    message: "Post fetched successfully",
    data: { id: params.id, name: "" },
  });
};
```

:::

Validation is explicit — the controller calls `validate()` directly on the raw input.

**Route** (`route/plain.ts.stub`):

```ts
import { group } from "@/framework/facade.js";

export default group()
  .get("/", index)
  .get("/:id", show)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

**Schema** (`controller/schema.plain.ts.stub`):

```ts
export const CreatePostSchema = z.object({ name: z.string().min(1) });
export const UpdatePostSchema = z.object({ name: z.string().min(1) });
export const PostIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
// No response schemas — only input validation schemas
```

### Route Auto-Linking

When you add a new route with `module:make-route`, the CLI automatically links it to the most recently modified controller in the module:

::: code-group

```bash [npm]
npm run maker module:make-route blog
```

```bash [pnpm]
pnpm maker module:make-route blog
```

```bash [yarn]
yarn maker module:make-route blog
```

```bash [npm]
bun maker module:make-route blog
```

:::

The linker (`resolveRouteControllerName` in `core.mjs`) works like this:

1. If you specify a controller name (e.g. `module:make-route blog post`), it checks for `controllers/post.controller.ts` and `controllers/post.schema.ts`
2. If those exist, it uses them. If not, it scans the module's `controllers/` directory and picks the **most recently modified** `.controller.ts` file
3. Falls back to the module name

The generated route file imports the controller's handlers and schemas:

```ts
import {
  index,
  show,
  store,
  update,
  destroy,
} from "@/modules/blog/controllers/post.controller.js";
// In OPEN_API mode, also imports schemas
import {
  PostIdParamsSchema,
  PostListResponseSchema,
} from "@/modules/blog/controllers/post.schema.js";
```

The route uses the `OPEN_API` setting active at **scaffold time** to decide the route style:

|                           | `OPEN_API=true`                                                                                | `OPEN_API=false`                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Route registration        | `.api(createRoute({...}), handler)` — each route carries full request/response schema metadata | `.get("/", handler)` — plain verb method, no metadata |
| Schema import             | Full set: params, body, response schemas                                                       | None — controller handles validation                  |
| Controller handlers wired | All 5 CRUD: `index, show, store, update, destroy`                                              | All 5 CRUD: `index, show, store, update, destroy`     |

**Important:** The route file is a **wrapper** — it does not contain business logic. It defines the HTTP metadata (path, method, params, response codes) and delegates execution to the controller. This keeps your controllers framework-agnostic and your route definitions declarative.

### Switching Modes

To scaffold in plain mode, set `OPEN_API=false` before running the generator:

::: code-group

```bash [npm]
OPEN_API=false npm run maker module:make-controller blog post
OPEN_API=false npm run maker module:make-route blog post
```

```bash [pnpm]
OPEN_API=false pnpm maker module:make-controller blog post
OPEN_API=false pnpm maker module:make-route blog post
```

```bash [yarn]
OPEN_API=false yarn maker module:make-controller blog post
OPEN_API=false yarn maker module:make-route blog post
```

```bash [bun]
OPEN_API=false bun maker module:make-controller blog post
OPEN_API=false bun maker module:make-route blog post
```

:::

To create a route that links to a specific controller:

::: code-group

```bash [npm]
# Links to controllers/post.controller.ts + controllers/post.schema.ts
npm run maker module:make-route blog post
# Saves as routes/post.ts (instead of api.ts)

npm run maker module:make-route blog --force
# Overwrites routes/api.ts if it already exists
```

```bash [pnpm]
# Links to controllers/post.controller.ts + controllers/post.schema.ts
pnpm maker module:make-route blog post
# Saves as routes/post.ts (instead of api.ts)

pnpm maker module:make-route blog --force
# Overwrites routes/api.ts if it already exists
```

```bash [yarn]
# Links to controllers/post.controller.ts + controllers/post.schema.ts
yarn maker module:make-route blog post
# Saves as routes/post.ts (instead of api.ts)

yarn maker module:make-route blog --force
# Overwrites routes/api.ts if it already exists
```

```bash [bun]
# Links to controllers/post.controller.ts + controllers/post.schema.ts
bun maker module:make-route blog post
# Saves as routes/post.ts (instead of api.ts)

bun maker module:make-route blog --force
# Overwrites routes/api.ts if it already exists
```

:::

Or set it in your `.env` to persist the choice. The CLI will print which mode it used at scaffold time.

> Example and notification stubs also respect the `OPEN_API` flag — they generate OpenAPI or plain routes/schemas just like regular module stubs.

## Sharing Logic Between Modules

Modules are self-contained, but sometimes a set of functions is needed in **most** modules — for example auth context helpers like `getCurrentUser()` or `hasRole()`. There are two acceptable places for such shared logic:

### 1. The auth module (auth-flavored context)

Every module already depends on the auth module (its middleware, `users` model, `jwt`, cookies), so having modules import auth context adds no new coupling. Put auth-owned helpers in one canonical file, e.g. `src/modules/auth/auth.helpers.ts`:

```ts
// src/modules/auth/auth.helpers.ts
import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";

export function hasRole(auth: any, rolesToMatch: string[]) {
  const role = String(auth?.role || "").toLowerCase();
  return rolesToMatch.includes(role);
}

export async function getCurrentUser(auth: any) {
  if (!auth?.id) return null;
  return db.query.users.findFirst({
    where: eq(users.id, Number(auth.id)),
    with: { role: true },
    columns: { password: false }
  });
}
```

Then any controller in any module imports from this single source:

```ts
import { getCurrentUser, hasRole } from "@/modules/auth/auth.helpers.js";
```

> **Note:** `requireRole()` guards a route as middleware (before the controller runs), while `hasRole()` / `getCurrentUser()` are used *inside* controllers for logic. Keep them separate — a middleware can't replace in-controller checks.

### 2. A `shared/` module (generic multi-module logic)

For logic that is **not auth-flavored** but is consumed by two or more modules, create `src/modules/shared/` as neutral ground:

```
src/modules/shared/
├── strings.ts
├── paginate.ts
└── ...
```

**Critical rule — the only thing that prevents circular imports:** `shared/` may never import from another module. It may import only from `@/framework/` and database models, so it forms a dead-end leaf:

```
posts ──▶ shared ──▶ framework
orders ─▶ shared ──▶ framework
auth ───▶ shared ──▶ framework
```

### What NOT to do — module-to-module imports

Do **not** let a module import from another module's helpers directly. If `blog` imports from `membership` and `membership` imports from `blog`, you get a **circular import** — an import cycle that can cause `undefined` bindings, abrupt failures, and subtle "works sometimes" bugs that are hard to trace.

**Circular import example (bad):**

```ts
// src/modules/posts/controllers/post.controller.ts
import { sendNotification } from "@/modules/notifications/notifications.helpers.js"; // ❌

// src/modules/notifications/.../notifications.helpers.ts
import { postService } from "@/modules/posts/services/post.service.js"; // ❌
```

`posts` needs `notifications`, and `notifications` needs `posts` — the two modules now import each other, forming a cycle.

**The fix (good):** promote the shared piece to `src/modules/shared/` (or the auth module if it's auth-flavored), so the dependency arrow always points "downward" to a leaf that never imports a module:

```ts
// src/modules/shared/notifications.ts   ← imports only @/framework/ + db models
export async function sendNotification(payload: { userId: number; text: string }) { /* ... */ }

// src/modules/posts/controllers/post.controller.ts   ✅
import { sendNotification } from "@/modules/shared/notifications.js";

// src/modules/posts/services/post.service.ts   ✅  (no postService import in notifications anymore)
```

### Decision guide

| Where does the logic live?                    | Where does it go?                     |
| --------------------------------------------- | ------------------------------------- |
| Auth-flavored, needed by most modules         | `src/modules/auth/auth.helpers.ts`    |
| Generic, needed by 2+ modules                 | `src/modules/shared/`                 |
| Only used inside one module                   | that module's `helpers.ts`            |
| Framework-stable, every app needs (e.g. `db`, `jwt`, `password`) | the facade (`@/framework/facade.js`) |

> If a module is the foundation every other module already depends on (like `auth`), other modules may import from it. For **any other** module, cross-module imports are a smell — extract instead.

## Auto-Discovery

**nexwire** automatically discovers and registers:

- **Routes** from `*/routes/*.ts`
- **Jobs** from `*/jobs/*.ts` with `shouldQueue`
- **Schedules** from `*/schedules/*.ts` or `*/console/*.ts` with `defineSchedule`
- **Models** from `*/database/models/*.ts`
- **Seeders** from `*/database/seeders/*.ts`
