# `group` — router shorthand + middleware

Imported from the facade: `import { group } from "@/framework/facade.js"`.

Shorthand for `createRouter().group(...)`, plus the building block when spreading role middleware arrays across `api()` calls. See [Routing](./../guide/routing).

## Signature

| Function | Signature                           | Description                                                                               |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `group`  | `(...middlewares) => NexwireRouter` | `createRouter().group(...middlewares)` — applies middleware to routes registered after it |

## Use cases

### Group with middleware

`group(middleware)` applies to all routes; `api(route, [middlewares], handler)` applies per-route:

```ts
import {
  createRouter,
  createRoute,
  HttpStatusCodes,
  jsonContent,
  z,
} from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";

export default createRouter()
  .group(authMiddleware) // all routes require auth
  .api(listRoute, index)
  .api(showRoute, [requireRole("admin")], show); // only admin role
```

### Real world — role middleware arrays

```ts
// modules/auth/routes/api.ts
.createRouter()
  .group(authMiddleware)
  .api(usersIndexRoute, [requireRole("supreme", "superadmin", "admin")], usersIndex)
  .api(profileRoute, [requireRole("supreme", "superadmin", "admin", "guest")], profile);
```

## Notes

- Middleware given to `group()` runs for every route registered after it on that router, and only those: it travels with the routes through `.route()` mounts and never reaches a sibling group or a route added to the parent afterwards. Two groups mounted at the same prefix stay independent — see [Routing](./../guide/routing).
- Group middleware runs before the per-route middleware in `api(route, [middlewares], handler)`, and after request validation.
- `requireRole(...roles)` is a middleware factory — spread an array of role names as shown above.
- Prefer `group()` (no `createRouter`) when exporting the default route object from a module.

## Related

- [createRouter](./createRouter) · [createRoute](./createRoute)
