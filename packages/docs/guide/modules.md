# Modules

Every feature lives in `src/modules/<module-name>`. A module is a self-contained folder — the framework discovers files by **directory**, so the folder gives a file its meaning and the filename is only a readability aid (see [Conventions](/guide/conventions)).

```
src/modules/<module>/
├── __tests__/         # Unit testing
├── console/           # Scheduled tasks (defineSchedule)
├── controllers/       # Request handlers
├── database/
│   ├── models/        # Drizzle table definitions
│   └── seeders/       # Test data
├── helpers/           # Pure functions — no I/O
├── jobs/              # Queue workers (shouldQueue)
├── middlewares/       # Module-local middleware
├── routes/            # HTTP route definitions (auto-discovered)
├── schemas/           # Zod validation schemas
├── services/          # Business logic — DB, files, network
├── types/             # Shared TypeScript types
└── facade.ts          # The module's public API
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
# or create multiple modules
bun maker module:make post tag testme
# or in a panel
bun maker module:make post --path=admin
```

:::

`module:make` scaffolds a complete module in one run:

| Generated  | Path                                            |
| ---------- | ----------------------------------------------- |
| Facade     | `src/modules/<name>/facade.ts`                  |
| Controller | `src/modules/<name>/controllers/<name>.ts`      |
| Schema     | `src/modules/<name>/schemas/<name>.ts`          |
| Service    | `src/modules/<name>/services/<name>.ts`         |
| Route      | `src/modules/<name>/routes/index.ts`            |
| Model      | `src/modules/<name>/database/models/<name>.ts`  |
| Seeder     | `src/modules/<name>/database/seeders/<name>.ts` |

- The controller, schema, service and route adapt to your `OPEN_API` setting — see [OpenAPI Mode](#openapi-mode).
- Create several modules in one run (`module:make post tag testme`). The batch continues past a name that fails validation and exits non-zero when any module failed.
- The CLI refuses to touch a module folder that already has content. Re-run with `--force` to overwrite its files.

### Notification module

`module:make-notification [name]` scaffolds the notification backend — controller, schema, routes and a delivery job. Default name is `notification`. The Vue UI is manual: see [Notification](/guide/notification).

## Adding Components

Every component command targets an **existing** module and writes one file. All of them share three flags:

| Flag        | Effect                                     |
| ----------- | ------------------------------------------ |
| `--force`   | Overwrite the file when it already exists  |
| `--dry-run` | Print what would be created, write nothing |
| `--path`    | Address a module inside a panel folder     |

::: code-group

```bash [npm]
npm run maker module:make-controller blog post
npm run maker module:make-route blog
npm run maker module:make-schema blog post
npm run maker module:make-service blog post
npm run maker module:make-helper blog format
npm run maker module:make-middleware blog auth-check
npm run maker module:make-type blog dto
npm run maker module:make-model blog post
npm run maker module:make-seeder blog post
npm run maker module:make-job blog process-comment
npm run maker module:make-console blog cleanup
npm run maker module:make-test blog post
```

```bash [pnpm]
pnpm maker module:make-controller blog post
pnpm maker module:make-route blog
pnpm maker module:make-schema blog post
pnpm maker module:make-service blog post
pnpm maker module:make-helper blog format
pnpm maker module:make-middleware blog auth-check
pnpm maker module:make-type blog dto
pnpm maker module:make-model blog post
pnpm maker module:make-seeder blog post
pnpm maker module:make-job blog process-comment
pnpm maker module:make-console blog cleanup
pnpm maker module:make-test blog post
```

```bash [yarn]
yarn maker module:make-controller blog post
yarn maker module:make-route blog
yarn maker module:make-schema blog post
yarn maker module:make-service blog post
yarn maker module:make-helper blog format
yarn maker module:make-middleware blog auth-check
yarn maker module:make-type blog dto
yarn maker module:make-model blog post
yarn maker module:make-seeder blog post
yarn maker module:make-job blog process-comment
yarn maker module:make-console blog cleanup
yarn maker module:make-test blog post
```

```bash [bun]
bun maker module:make-controller blog post
bun maker module:make-route blog
bun maker module:make-schema blog post
bun maker module:make-service blog post --with-model
bun maker module:make-helper blog format
bun maker module:make-middleware blog auth-check
bun maker module:make-type blog dto
bun maker module:make-model blog post
bun maker module:make-seeder blog post
bun maker module:make-job blog process-comment
bun maker module:make-console blog cleanup
bun maker module:make-test blog post
```

:::

| Command                             | Writes                                  | Notes                                                          |
| ----------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `module:make-controller <m> [name]` | `controllers/<name>.ts`                 | Delegates to the service when one exists, standalone otherwise |
| `module:make-route <m> [name]`      | `routes/index.ts` or `routes/<name>.ts` | Standalone route with placeholder handlers                     |
| `module:make-schema <m> [name]`     | `schemas/<name>.ts`                     | Full or minimal schema set, per `OPEN_API`                     |
| `module:make-service <m> [name]`    | `services/<name>.ts`                    | Drizzle-backed when the model exists or `--with-model` is set  |
| `module:make-helper <m> [name]`     | `helpers/<name>.ts`                     | Pure-function placeholder                                      |
| `module:make-middleware <m> [name]` | `middlewares/<name>.ts`                 | Route-scoped middleware — register it in a route file          |
| `module:make-type <m> [name]`       | `types/<name>.ts`                       | `Record`, `Result` and `ListResult` interfaces                 |
| `module:make-model <m> [name]`      | `database/models/<name>.ts`             | Dialect-aware: SQLite, MySQL or PostgreSQL                     |
| `module:make-seeder <m> [name]`     | `database/seeders/<name>.ts`            | Bound to the model when one matches, standalone otherwise       |
| `module:make-job <m> [name]`        | `jobs/<name>.ts`                        | `shouldQueue` worker pattern                                   |
| `module:make-console <m> [name]`    | `console/<name>.ts`                     | `defineSchedule` cron pattern                                  |
| `module:make-test <m> [name]`       | `__tests__/<name>.test.ts`              | Vitest unit test                                               |

### Controller ↔ service wiring

`module:make-controller` checks whether `services/<name>.ts` exists (legacy `controllers/<name>.service.ts` paths still count). When it does, the generated controller delegates every handler to `<name>Service`; when it does not, the controller gets standalone handlers you wire up yourself. Generate the service first — or just use `module:make` — for the wired shape.

`module:make-service` picks the Drizzle-backed stub when `database/models/<name>.ts` exists (no flag needed) or when you pass `--with-model`. Without a model it writes a stub with `TODO` markers where the queries go.

### Route files

`module:make-route blog` writes `routes/index.ts`; `module:make-route blog post` writes `routes/post.ts`. The standalone stub ships with `not implemented` handlers plus commented-out wiring for the controller and schemas — attach real handlers when ready. Re-run with `--force` to overwrite an existing route file.

## The Module Facade

`module:make` generates `facade.ts` — the module's **public API** and the single door other modules knock on. It ships as an empty shell to fill in:

```ts
// src/modules/blog/facade.ts
export { list, findOne } from "./services/blog.js";
```

Other modules import from the door, never from internals:

```ts
// ✅ through the door
import { list } from "@/modules/blog/facade.js";

// ❌ reaching into internals — breaks the moment you refactor
import { list } from "@/modules/blog/services/blog.js";
```

The facade is also how a module **shares its logic** with the rest of the app. It is the front door for sharing: export every function another module may need — service methods, helpers, schema builders — from `facade.ts`, and importers never touch the internals. When `blog` needs something from `membership`, the fix is for `membership` to export that piece through its facade and for `blog` to import it through the door — not for `blog` to reach into `membership`'s files, which is a circular import waiting to happen (see [Sharing Logic Between Modules](#sharing-logic-between-modules)).

The three rules (full rationale in [Conventions → Module facades](/guide/conventions#module-facades)):

> **Rule 1 — Modules talk to each other ONLY through facades.**
> **Rule 2 — Facades NEVER import other facades.**
> **Rule 3 — Each module NEVER imports/uses its own facade.**

## Panels (`--path`)

A panel is only a folder separator — no manifest, no marker file, no registry. Panels and normal modules follow identical rules:

::: code-group

```bash [npm]
npm run maker module:make post -- --path=admin
```

```bash [pnpm]
pnpm maker module:make post --path=admin
```

```bash [yarn]
yarn maker module:make post --path=admin
```

```bash [bun]
bun maker module:make post --path=admin
```

:::

- The module lives at `src/modules/admin/post/` and is mounted at `/api/admin/post`.
- Nested panels work too: `--path=admin/reporting` → `src/modules/admin/reporting/post/` → `/api/admin/reporting/post`.
- Route tags are derived from the path (`Admin / Post`), so Scalar groups panel routes automatically.
- Every `module:*` subcommand accepts `--path`, e.g. `module:make-controller blog post --path=admin` writes `src/modules/admin/blog/controllers/post.ts`.

## OpenAPI Mode

Generated controllers, routes and schemas adapt to the `OPEN_API` environment variable (default: `true`). The CLI reads it at scaffold time (`env-db.mjs:openApiEnabled()`) and selects the matching stub templates.

| Aspect                    | `OPEN_API=true` (default)                                                                                                          | `OPEN_API=false`                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Controller validation** | `c.req.valid("param")` / `c.req.valid("json")` (Hono) or validated route parts (Express) — driven by the route schema              | `await validate(Schema, data)` — manual validation call via `@/framework/facade.js` |
| **Schema file**           | Full set: `ItemSchema`, `CreateSchema`, `UpdateSchema`, `IdParamsSchema`, response schemas (`ListResponse`, `Response`, `Message`) | Minimal: only `CreateSchema`, `UpdateSchema`, `IdParamsSchema` (input-only)         |
| **Route file**            | Uses `createRoute()` with `.api()` — each route has metadata (path, method, tags, request params/body, response codes)             | Uses direct verb methods `.get("/:id", handler)` — no metadata, no response schemas |
| **Controller imports**    | Service only — validation is driven by the route                                                                                   | `validate` + schemas + service                                                      |
| **Generated API docs**    | Routes appear in Scalar UI at `/api-docs` with full request/response schemas                                                       | No auto-generated documentation                                                     |

### `OPEN_API=true` — OpenAPI stubs

**Controller** (`controller/openapi.ts.stub`):

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { HttpStatusCodes } from "@/framework/facade.js";
import { postService } from "@/modules/blog/services/post.js";

export const show: Handler = async (c: any) => {
  const { id } = c.req.valid("param");
  const data = await postService.findOne(id);

  if (!data) {
    return c.json({ message: "post not found" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.json({ message: "post fetched successfully", data });
};
```

```ts [Express]
import type { Request, Response } from "express";
import { HttpStatusCodes } from "@/framework/facade.js";
import { postService } from "@/modules/blog/services/post.js";

export const show = async (req: Request, res: Response) => {
  const data = await postService.findOne(Number(req.params.id)); // validated by route schema

  if (!data) {
    res.status(HttpStatusCodes.NOT_FOUND).json({ message: "post not found" });
    return;
  }

  res.json({ message: "post fetched successfully", data });
};
```

:::

Validation comes from the route definition — the controller reads validated data and delegates to the service.

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

The full stub wires all five CRUD routes and imports `authMiddleware` / `requireRole` with commented-out gating examples — delete those imports when you do not need them.

**Schema** (`schema/name.ts.stub`):

```ts
export const PostItemSchema = z.object({ id: z.number(), name: z.string() });
export const PostResponseSchema = z.object({
  message: z.string(),
  data: PostItemSchema,
});
// + CreatePostSchema, UpdatePostSchema, PostIdParamsSchema,
//   PostListResponseSchema, PostMessageSchema
```

### `OPEN_API=false` — plain stubs

**Controller** (`controller/plain.ts.stub`):

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { HttpStatusCodes, validate } from "@/framework/facade.js";
import { PostIdParamsSchema } from "@/modules/blog/schemas/post.js";
import { postService } from "@/modules/blog/services/post.js";

export const show: Handler = async (c: any) => {
  const params = await validate(PostIdParamsSchema, c.req.param());
  const data = await postService.findOne(params.id);

  if (!data) {
    return c.json({ message: "post not found" }, HttpStatusCodes.NOT_FOUND);
  }

  return c.json({ message: "post fetched successfully", data });
};
```

```ts [Express]
import type { Request, Response } from "express";
import { HttpStatusCodes, validate } from "@/framework/facade.js";
import { PostIdParamsSchema } from "@/modules/blog/schemas/post.js";
import { postService } from "@/modules/blog/services/post.js";

export const show = async (req: Request, res: Response) => {
  const params = await validate(PostIdParamsSchema, req.params);
  const data = await postService.findOne(params.id);

  if (!data) {
    res.status(HttpStatusCodes.NOT_FOUND).json({ message: "post not found" });
    return;
  }

  res.json({ message: "post fetched successfully", data });
};
```

:::

Validation is explicit — the controller calls `validate()` on the raw input, then delegates to the service.

**Route** (`route/plain.ts.stub`):

```ts
import { group } from "@/framework/facade.js";
import { index, show, store, update, destroy } from "@/modules/blog/controllers/post.js";

export default group()
  .get("/", index)
  .get("/:id", show)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

**Schema** (`schema/name.plain.ts.stub`):

```ts
export const CreatePostSchema = z.object({ name: z.string().min(1) });
export const UpdatePostSchema = z.object({ name: z.string().min(1) });
export const PostIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
// No response schemas — only input validation schemas
```

## Switching Modes

To scaffold in plain mode, set `OPEN_API=false` before running the generator:

::: code-group

```bash [npm]
OPEN_API=false npm run maker module:make-controller blog post
OPEN_API=false npm run maker module:make-route blog
```

```bash [pnpm]
OPEN_API=false pnpm maker module:make-controller blog post
OPEN_API=false pnpm maker module:make-route blog
```

```bash [yarn]
OPEN_API=false yarn maker module:make-controller blog post
OPEN_API=false yarn maker module:make-route blog
```

```bash [bun]
OPEN_API=false bun maker module:make-controller blog post
OPEN_API=false bun maker module:make-route blog
```

:::

Or set it in your `.env` to persist the choice. The CLI prints which mode it used at scaffold time.

> Example and notification stubs also respect the `OPEN_API` flag — they generate OpenAPI or plain routes/schemas just like regular module stubs.

## Sharing Logic Between Modules

Modules are self-contained, but sometimes a set of functions is needed in **most** modules — for example auth context helpers like `getCurrentUser()` or `hasRole()`. The module facade is the front door for sharing such logic ([The Module Facade](#the-module-facade)): a module exports what others may use through its `facade.ts`, and importers come through the door. There are two acceptable places for shared logic:

### 1. The auth module (auth-flavored context)

Every module already depends on the auth module (its middleware, `users` model, `jwt`, cookies), so having modules import auth context adds no new coupling. Put auth-owned helpers in one canonical file, `src/modules/auth/helpers/auth.helpers.ts`, and export them through the auth facade:

```ts
// src/modules/auth/facade.ts
export { hasRole, getCurrentUser } from "./helpers/auth.helpers.js";
```

Then any controller in any module imports from the door:

```ts
import { getCurrentUser, hasRole } from "@/modules/auth/facade.js";
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

Do **not** let a module import from another module's internals directly. If `blog` imports from `membership` and `membership` imports from `blog`, you get a **circular import** — an import cycle that can cause `undefined` bindings, abrupt failures, and subtle "works sometimes" bugs that are hard to trace.

**Circular import example (bad):**

```ts
// src/modules/posts/controllers/post.ts
import { sendNotification } from "@/modules/notifications/helpers/notification.js"; // ❌

// src/modules/notifications/services/notification.ts
import { postService } from "@/modules/posts/services/post.js"; // ❌
```

`posts` needs `notifications`, and `notifications` needs `posts` — the two modules now import each other, forming a cycle.

**The fix (good):** promote the shared piece to `src/modules/shared/` (or the auth module if it's auth-flavored), so the dependency arrow always points "downward" to a leaf that never imports a module:

```ts
// src/modules/shared/notifications.ts   ← imports only @/framework/ + db models
export async function sendNotification(payload: { userId: number; text: string }) { /* ... */ }

// src/modules/posts/controllers/post.ts   ✅
import { sendNotification } from "@/modules/shared/notifications.js";

// src/modules/posts/services/post.ts   ✅  (no postService import in notifications anymore)
```

### Decision guide

| Where does the logic live?                                       | Where does it go?                                   |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| Auth-flavored, needed by most modules                            | `auth` module → export via facade                   |
| Generic, needed by 2+ modules                                    | `src/modules/shared/`                               |
| Only used inside one module                                      | that module's `helpers/`                            |
| Framework-stable, every app needs (e.g. `db`, `jwt`, `password`) | the facade (`@/framework/facade.js`)            |

> If a module is the foundation every other module already depends on (like `auth`), other modules may import from its facade. For **any other** module, cross-module imports go through facades — reaching into internals is a smell; extract instead.

## Auto-Discovery

**nexwire** automatically discovers and registers — no manual registration needed:

- **Routes** from `*/routes/*.ts` — mounted under `/api/<module>` (panel paths included, so `admin/post` mounts at `/api/admin/post`)
- **Jobs** from `*/jobs/*.ts` with `shouldQueue`
- **Schedules** from `*/schedules/*.ts` or `*/console/*.ts` with `defineSchedule`
- **Models** from `*/database/models/*.ts`
- **Seeders** from `*/database/seeders/*.ts`

## Managing Modules

| Command                      | Effect                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `module:list`                | List all discovered modules                               |
| `module:seed <module>`       | Run a module's seeders                                    |
| `module:migrate <module>`    | Generate a module-only schema, create a migration, run it |
| `module:delete <name>`       | Soft-delete to `src/storage/trash/modules/` (recoverable) |
| `module:delete-notification` | Remove the notification backend module                    |
| `module:trash:clean [name]`  | Permanently remove trash entries                          |

Delete and trash commands accept `--yes` (no prompt) and `--dry-run` (preview). See [Module Commands](/cli/module) for the full flag reference.

## Pre-4.1.0 module layout

Modules scaffolded before 4.1.0 kept schemas, helpers and services inside `controllers/` with suffixed filenames (`post.schema.ts`, `post.helpers.ts`, `post.service.ts`). Those legacy paths still resolve — the CLI falls back to them — so existing projects keep working. New files belong in the dedicated folders above; the `@/` alias keeps imports stable while you move things at your own pace.

## Related

- [Conventions](/guide/conventions) — naming rules, facades, circular imports
- [Module Commands](/cli/module) — the full `maker module:*` reference
- [Architecture](/guide/architecture) — full project layout
- [Notification](/guide/notification) — notification UI integration
