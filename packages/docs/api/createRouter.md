# `createRouter` — the module router

Imported from the facade: `import { createRouter } from "@/framework/facade.js"`.

Creates the module router every module route file exports — an `OpenAPIHono` instance on Hono, an Express `Router` on Express. Both add the same helpers: `group()` (middleware for all later routes), `api()` (register a `createRoute` with an optional middleware array), and `route()` (mount sub-routers). See [Routing](./../guide/routing).

## Signature

| Function       | Signature                                                  | Description                                                                |
| -------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `createRouter` | `() => NexwireRouter`                                       | Creates the engine's router with `group()`, `api()`, and `route()` helpers |
| `router.group` | `(...middlewares) => NexwireRouter`                         | Applies middleware to every route registered after it                      |
| `router.api`   | `(route, handlerOrMiddlewares?, handler?) => NexwireRouter` | Registers a `createRoute`; accepts an optional middleware array            |

## Use cases

### Public vs protected groups

```ts
const publicRoutes = createRouter()
  .group(loginLimiter)
  .api(registerRoute, register);
const protectedRoutes = createRouter().group(authMiddleware).api(meRoute, me);

export default createRouter()
  .route("/", publicRoutes)
  .route("/", protectedRoutes);
```

### Real world — the auth router

```ts
// modules/auth/routes/api.ts
const publicRoute = createRouter()
  .group(loginLimiter)
  .api(loginRoute, login)
  .api(forgotPasswordRoute, forgotPassword);

const protectedRoute = createRouter()
  .group(authMiddleware)
  .api(
    usersIndexRoute,
    [requireRole("supreme", "superadmin", "admin")],
    usersIndex,
  )
  .api(userDestroyRoute, [requireRole("supreme", "superadmin")], userDestroy);

export default createRouter()
  .route("/", publicRoute)
  .route("/", protectedRoute);
```

### Plain routes without OpenAPI

When `OPEN_API=false`, skip `createRoute` and use verb methods directly:

```ts
export default createRouter()
  .get("/", index)
  .get("/:id", show)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

## Notes

- On **Hono**, `createRouter` returns an `OpenAPIHono` instance (from `@hono/zod-openapi`), so all standard Hono methods (`.get`, `.post`, `.middleware`, …) are available. On **Express** it returns an `express.Router` augmented with the same helpers — standard Express methods (`.get`, `.post`, `.use`, …) work too, and handlers receive `(req, res)`.
- Route auto-discovery imports the default export of each `routes/*.ts` and mounts it under `/api/<module>`.
- `api(route, middlewares, handler)` throws if `handler` is missing while a middleware array is given.
- Shorthand: `group(...)` == `createRouter().group(...)`.

## Related

- [createRoute](./createRoute) · [group](./group) · [jsonContent](./jsonContent) · [z](./z) · [HttpStatusCodes](./HttpStatusCodes)
