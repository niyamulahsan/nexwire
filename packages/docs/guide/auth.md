# Authentication

## Overview

Auth ships complete. A fresh project has a working user system — you protect a route and sign in; you do not build the login flow first.

| Included                | Route                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Register                | `POST /api/auth/register`                                         |
| Sign in                 | `POST /api/auth/login`                                            |
| Email verification      | `POST /api/auth/verify-email`                                     |
| Forgot / reset password | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Silent refresh          | `POST /api/auth/refresh-token` (and automatic in the middleware)  |
| Sign out                | `POST /api/auth/logout`, `POST /api/auth/logout-all`              |
| Current user            | `GET /api/auth/me`                                                |
| Roles                   | `GET /api/auth/role`, admin only                                  |

Three layers do the work, and it helps to know which one you are changing:

| Layer           | What it owns                                    | Where                                      |
| --------------- | ----------------------------------------------- | ------------------------------------------ |
| **Auth module** | Users, passwords, tokens, routes, seeders       | `src/modules/auth/`                        |
| **Middleware**  | The gate: authenticate a request, expose `auth` | `src/middlewares/auth-middleware.ts`       |
| **Provider**    | Where users and refresh tokens are read from    | `src/providers/` (or the built-in default) |

You only touch the provider when you want a different user store. Everything else works as shipped — see [Replacing auth](#replacing-auth).

## Protect a route

Attach `authMiddleware` to the group, or to a single route with an array. Hono and Express share the same form; Fastify uses a scoped hook or a route `preHandler`:

```ts
// src/modules/posts/routes/index.ts — Hono / Express
import { createRouter } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";

export default createRouter()
  .api(listRoute, list) // public
  .api(createRouteDef, [authMiddleware], create) // any signed-in user
  .api(adminRoute, [authMiddleware, requireRole("admin")], remove); // admin only
```

```ts
// src/modules/posts/routes/index.ts — Fastify
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", list); // public

  app.route({ method: "POST", url: "/", preHandler: authMiddleware, handler: create });
  app.route({
    method: "DELETE",
    url: "/:id",
    preHandler: [authMiddleware, requireRole("admin")],
    handler: remove,
  });
};

export default routes;
```

The handler reads the authenticated user from the request context:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const create: Handler = async (c: any) => {
  const auth = c.get("auth");
  // auth.id, auth.email, auth.roleId, auth.role, ...provider fields
  return c.json({ message: `Hello ${auth.email}` });
};
```

```ts [Express]
import type { Request, Response } from "express";

export const create = async (req: Request, res: Response) => {
  const auth = res.locals.auth;
  // auth.id, auth.email, auth.roleId, auth.role, ...provider fields
  res.json({ message: `Hello ${auth.email}` });
};
```

```ts [Fastify]
import type { FastifyReply, FastifyRequest } from "fastify";

export const create = async (request: FastifyRequest, reply: FastifyReply) => {
  const auth = request.auth;
  // auth.id, auth.email, auth.roleId, auth.role, ...provider fields
  return reply.code(200).send({ message: `Hello ${auth.email}` });
};
```

:::

What the request gets:

| Request                                                         | Result                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Valid `Authorization: Bearer <token>` header                    | `200` — handler runs with `auth` set (the header wins over any cookie)              |
| Valid access cookie                                             | `200` — handler runs with `auth` set                                                |
| Expired access cookie + valid refresh cookie                    | A new access token is set as a cookie, then the handler runs                        |
| No valid credential, or a revoked/expired refresh token         | `401` — cookies are cleared, the handler never runs                                 |
| No auth provider at all                                         | Warning logged, `next()` runs unauthenticated — see [degraded mode](#degraded-mode) |

Order matters: `authMiddleware` before `requireRole`, because `requireRole` reads what `authMiddleware` wrote. See [Middleware](./middleware#order-matters).

## What the middleware does

```
request
  │
  ├─ Authorization: Bearer <token> header present?
  │    └─ use it as the access token (the cookie is not consulted)
  │
  ├─ otherwise, access cookie present?
  │    ├─ verify JWT
  │    ├─ provider.getUserById(payload.id)
  │    ├─ provider.getAuthContext(user, payload)?   ← optional shape override
  │    └─ set auth → next()
  │
  ├─ otherwise, refresh cookie present?
  │    ├─ verify JWT
  │    ├─ provider.findRefreshToken(jti)
  │    ├─ reject if missing, revoked, or past expiresAt
  │    ├─ provider.getUserById(payload.id)
  │    ├─ mint a new access token + set the cookie
  │    └─ set auth → next()
  │
  └─ otherwise → 401, clear both cookies
```

Details worth knowing:

- The `Authorization: Bearer` header is checked **first**. A request that sends both a header and a cookie uses the header; a request with neither is `401`.
- Only the **access** token is re-minted on refresh. The refresh token is not rotated on every request.
- A refresh token that is past `expiresAt` is deleted through `deleteRefreshToken` (or revoked through `revokeRefreshToken`).
- If `getUserById()` returns `null` for a token that verifies, the request is treated as unauthenticated: `401` and both cookies are cleared.
- If `getAuthContext()` is implemented, its return value is what handlers receive. Without it, the middleware builds `{ ...payload, id, email, roleId, role, ...user }`.
- The refresh step reads the **refresh cookie**, so it only applies to cookie clients. A bearer client refreshes explicitly — see [Bearer tokens](#bearer-tokens-non-browser-clients).

### Degraded mode

If **no auth provider** can be resolved — the built-in module was deleted and nothing was registered — the middleware does this:

```
[auth-middleware] auth provider not available; skipping auth.
```

and calls `next()` without setting `auth`.

::: warning Not a security boundary
That fallback exists so deleting the auth module does not crash every route. It is **unauthenticated pass-through**: a protected handler still runs. If a deployment can reach this state, the handler must check for a missing `auth` itself. With a provider present, an unauthenticated request is always `401`.
:::

## Bearer tokens (non-browser clients)

The browser SPA authenticates with cookies, but a desktop app, a CLI, a mobile app or a server-to-server script has no cookie jar. Those clients send a standard bearer header instead:

```
Authorization: Bearer <access_token>
```

`authMiddleware` reads that header **first** on every protected route, so the same routes, the same `auth` object and the same `requireRole()` checks serve both kinds of client. No route or config change is needed — the guard already accepts it.

### Sign in and store the pair

`POST /api/auth/login` (and `/register`) returns the tokens **in the response body**, not only as cookies:

```json
{
  "message": "User logged in successfully",
  "data": {
    "user": { "id": 1, "name": "Jane", "email": "user@example.com", "roleId": 2, "role": { "id": 2, "name": "user" } },
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "Bearer"
  }
}
```

Store both. The access token is short-lived; the refresh token is the long-lived credential.

### Refresh explicitly

The middleware's silent refresh reads the **refresh cookie**, so it does not fire for a bearer client. Instead, when a protected request answers `401`, the client refreshes itself:

```
POST /api/auth/refresh-token
Content-Type: application/json

{ "refresh_token": "<refresh_token>" }
```

The response has the same shape as login, and the pair **rotates** — store both new values and retry the original request once. A `401` from the refresh endpoint itself means the refresh token is expired or revoked: sign the user out.

### Logout

`POST /api/auth/logout` is protected, so a bearer client calls it with its header. The shipped handler revokes the refresh token it finds in the **cookie**, so a bearer client's logout clears nothing server-side — its refresh token stays valid until it expires. A client that only drops its stored tokens has signed out locally but not revoked them. To revoke for real, call `POST /api/auth/logout-all`, which deletes every refresh token for the user, or lower `refreshExpirySeconds` in `src/config/jwt.ts`.

::: tip One guard, two clients
Bearer is additive: the cookie path is untouched, so adding a desktop or mobile client never changes how the SPA signs in. If you want bearer **only** (no cookies), delete the `cookie.setAuth` / `cookie.setRefresh` calls from the auth controllers — the response body already carries the tokens.
:::

## Roles

Roles are authorisation, applied after authentication. The scaffold seeds two roles:

| Role    | Seeded for          |
| ------- | ------------------- |
| `admin` | `admin@example.com` |
| `user`  | `user1@example.com` |

The seeder password is `Password@123`. Change or remove these accounts before deploying.

```ts
import { requireRole } from "@/middlewares/role-middleware.js";

.api(adminRoute, [authMiddleware, requireRole("admin")], remove)
.api(editorRoute, [authMiddleware, requireRole("admin", "editor")], update)
```

| Situation                      | Response                                  |
| ------------------------------ | ----------------------------------------- |
| `auth` is missing              | `401 Unauthorized`                        |
| `auth.role` is not in the list | `403 Forbidden: Insufficient permissions` |
| `auth.role` matches            | Continues to the handler                  |

- Comparison is **case-insensitive**: `requireRole("Admin")` matches `role: "admin"`.
- `auth.role` must be a **string**. The default provider maps the user's `role.name` to a string for you. A custom provider that returns `role: { id, name }` will not match — flatten it to a string in `getAuthContext()`.
- `requireRole()` returns a middleware function, so it can be used per route or in `group()`.
- `GET /api/auth/role` and `GET /api/auth/role/{id}` are admin-only examples of the same pattern.

To check a role inside a handler rather than rejecting the request, use the exported helper. It takes an **array** and matches the lowercased `auth.role`, so pass lowercase values:

```ts
import { hasRole } from "@/modules/auth/facade.js";

if (hasRole(auth, ["admin"])) {
  // ...
}
```

## Token system

Auth uses two JWTs, both signed with HS256. The browser SPA receives them as httpOnly cookies; a non-browser client sends the access token as a bearer header and the refresh token in the body of `/refresh-token`.

|                         | Access token                                            | Refresh token                                                                                |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Default lifetime        | 15 minutes (`accessExpirySeconds`)                      | 1 hour (`refreshExpirySeconds`), 30 days with "remember me" (`refreshRememberExpirySeconds`) |
| Secret                  | `JWT_ACCESS_SECRET`                                     | `JWT_REFRESH_SECRET`                                                                         |
| Cookie                  | `{cookie.name}_access`                                  | `{cookie.name}_refresh`                                                                      |
| Sent by the client      | Cookie automatically, or `Authorization: Bearer <token>` | Cookie automatically, or `{ refresh_token }` in the body of `POST /api/auth/refresh-token`  |
| Tracked in the database | No                                                      | Yes — `refresh_tokens` by `jti` (unique JWT id)                                              |
| Revocable               | No — expires on its own                                 | Yes — logout, logout-all, password reset                                                     |

The cookie client never implements refresh logic: when the access token expires, the next request refreshes it transparently. A bearer client refreshes itself on `401` — see [Bearer tokens](#bearer-tokens-non-browser-clients).

Verify a token yourself:

```ts
import { jwt } from "@/framework/facade.js";

const payload = await jwt.verifyToken(token, "access");
// null when expired, badly signed, or of the wrong type
```

## Configuration

| Variable                       | Default             | Description                                                                   |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`            | —                   | **Required.** Signs access tokens                                             |
| `JWT_REFRESH_SECRET`           | —                   | **Required.** Signs refresh tokens                                            |
| `COOKIE_SECRET`                | —                   | **Required.** Signs cookies                                                   |
| `accessExpirySeconds`          | `900` (15 min)      | `src/config/jwt.ts`                                                           |
| `refreshExpirySeconds`         | `3600` (1 hour)     | `src/config/jwt.ts`                                                           |
| `refreshRememberExpirySeconds` | `2592000` (30 days) | `src/config/jwt.ts`                                                           |
| `cookie.name`                  | `nexwire`           | Cookie prefix — `nexwire_access`, `nexwire_refresh` in `src/config/cookie.ts` |
| `requireEmailVerification`     | `false`             | Blocks login until the email is verified, in `src/config/auth.ts`             |

The three secrets are the only required values. Generate each one separately; never reuse a secret between access, refresh and cookie signing.

## Cookies

Every auth cookie is `httpOnly`, `sameSite: "Lax"` (`"None"` and `secure` for cross-origin), `path: "/"`:

| Cookie                  | Contents    | Max-Age                                                                    |
| ----------------------- | ----------- | -------------------------------------------------------------------------- |
| `{cookie.name}_access`  | Access JWT  | `accessExpirySeconds`                                                      |
| `{cookie.name}_refresh` | Refresh JWT | `refreshExpirySeconds`, or `refreshRememberExpirySeconds` on "remember me" |

Because they are `httpOnly`, browser JavaScript cannot read them — the client authenticates by simply sending the request. See [Cookie](./support/cookie) for the facade. A non-browser client that has no cookie jar sends the access token as a bearer header instead — see [Bearer tokens](#bearer-tokens-non-browser-clients).

## Auth module map

The module is self-contained. This is what each part is for:

| Path                | Responsibility                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `routes/index.ts`   | Public routes (register, login, forgot/reset, verify, refresh) and protected routes (`me`, logout, logout-all) |
| `routes/role.ts`    | Role read routes, behind `authMiddleware` + `requireRole("admin")`                                             |
| `controllers/`      | HTTP layer: read the request, call a service, shape the response                                               |
| `services/`         | One file per action — `login.ts`, `register.ts`, `refreshtoken.ts`, `logout.ts`, …                             |
| `database/models/`  | Drizzle `users`, `roles`, `refresh_tokens` models                                                              |
| `database/seeders/` | `admin` / `user` roles and two demo users                                                                      |
| `jobs/`             | Mail jobs for registration, verification and password reset                                                    |
| `helpers/auth.ts`   | `getCurrentUser`, `hasRole` — exported through the facade                                                      |
| `facade.ts`         | The module's public API; other modules import from here, never from controllers or services                    |

Routes are auto-discovered: any `src/modules/<module>/routes/*.ts` file is mounted at `/api/<module>`. Adding a route file does not require editing a registry.

## Replacing auth

The provider is a **data adapter**, not a whole auth system. It answers two questions for the middleware:

1. Who is the user with this id? (`getUserById`)
2. Is this refresh token still valid? (`findRefreshToken`)

Its contract is `AuthProvider`; the required methods are `getUserById` and `findRefreshToken`, and four more are optional. The full contract table is in [Providers → The built-in auth contract](./providers#the-built-in-auth-contract).

```ts
// src/providers/auth.ts — imported automatically at boot
import { registerAuthProvider } from "@/framework/facade.js";
import type { AuthProvider } from "@/framework/facade.js";

const authProvider: AuthProvider = {
  async getUserById(id) {
    // Any shape you like. Extra fields reach `auth.tenantId`, `auth.plan`, ...
    return { id, email: "user@example.com", tenantId: 42, plan: "pro" };
  },
  async findRefreshToken(jti) {
    return { id: 1, jti, revoked: false, expiresAt: new Date() };
  },
  async revokeRefreshToken(tokenId) {},
  async getAuthContext(user, payload) {
    // Optional — this object becomes `auth`. Keep `role` a string for requireRole().
    return { id: user.id, email: user.email, role: "user", tenantId: user.tenantId };
  },
  async getUserContact(userId) {
    // Optional — used by notify() to find an email address.
    return { email: "user@example.com", name: "User" };
  }
};

registerAuthProvider(authProvider);
```

### What the provider does and does not control

| Provider controls                | The auth module still controls                 |
| -------------------------------- | ---------------------------------------------- |
| Where users live                 | `POST /api/auth/login` and credential checking |
| Where refresh tokens are stored  | Signing and issuing JWTs                       |
| The shape of `auth`              | Password hashing and the register flow         |
| Email/name lookup for `notify()` | Email verification and password reset          |

Registering a provider **replaces** the built-in one. It does not decorate or extend it: two providers cannot both answer for the `auth` key, and the last registration wins.

### Consequences of deleting the module

Deleting `src/modules/auth` removes the routes above — including `/login`, `/register` and `/refresh-token` — plus the JWT issuance, password hashing hooks, seeders and models.

The middleware can still authenticate and refresh **existing** sessions through your provider, but nothing creates a new sign-in. A custom auth system has to provide its own token issuance before it can log anyone in.

Notifications are unaffected: the generated notification module has no foreign key to `users` and no import of `@/modules/auth`.

## Password hashing

The module uses **bcrypt** with a cost factor of 10:

```ts
import { password } from "@/framework/facade.js";

const hash = await password.hashPassword(plainPassword);
const match = await password.verifyPassword(plainPassword, hash);
```

See [Password](./support/password) for the full facade.

## Session

Guest sessions are a **separate** subsystem, not part of auth: a `nexwire_session` cookie backed by Redis, usable by guests and signed-in users alike.

```ts
const sessionId = c.get("sessionId"); // Express: res.locals.sessionId
await session.put(sessionId, "cart", items);
```

See [Session](./session) for configuration and the API.

## Database models

### users

| Column            | Type              | Notes              |
| ----------------- | ----------------- | ------------------ |
| `id`              | int PK            | auto-increment     |
| `name`            | varchar(255)      |                    |
| `email`           | varchar(255)      | unique             |
| `password`        | text              | bcrypt hash        |
| `roleId`          | int FK → roles.id | set null on delete |
| `emailVerifiedAt` | timestamp         | nullable           |
| `createdAt`       | timestamp         |                    |
| `updatedAt`       | timestamp         |                    |

### roles

| Column      | Type         | Notes          |
| ----------- | ------------ | -------------- |
| `id`        | int PK       | auto-increment |
| `name`      | varchar(255) | unique         |
| `createdAt` | timestamp    |                |
| `updatedAt` | timestamp    |                |

### refresh_tokens

| Column      | Type              | Notes              |
| ----------- | ----------------- | ------------------ |
| `id`        | int PK            | auto-increment     |
| `userId`    | int FK → users.id | set null on delete |
| `jti`       | varchar(191)      | unique, JWT id     |
| `revoked`   | boolean           | default `false`    |
| `expiresAt` | timestamp         |                    |
| `createdAt` | timestamp         |                    |

## Email verification

When `requireEmailVerification` is `true` in `src/config/auth.ts`:

1. Registration creates an `email_verification_tokens` record with a 24-hour expiry.
2. A `"user:verify-email"` job sends the email.
3. The user follows the link and the client calls `POST /api/auth/verify-email` with `email` + `token`.
4. `emailVerifiedAt` is set, and login is allowed.

## Forgot / reset password

1. `POST /api/auth/forgot-password` creates a `password_reset_tokens` record with a 15-minute expiry and sends the email.
2. The client calls `POST /api/auth/reset-password` with `email`, `token`, `password` and `password_confirmation`.
3. The password is updated and **all** refresh tokens are revoked, signing the user out on every device.

## Related

- [Middleware](./middleware) — applying middleware, order, writing your own.
- [Providers](./providers) — the full auth and notification contracts.
- [Session](./session) — guest sessions, separate from auth.
- [JWT](./support/jwt) — signing and verifying tokens.
- [Cookie](./support/cookie) — cookie helpers.
- [Password](./support/password) — hashing helpers.
- [Rate Limiter](./rate-limiter) — the login limiter.
