# Cookie

## Overview

The cookie utility provides helpers for managing **auth-related httpOnly cookies** — setting, reading, and clearing access/refresh token cookies. It wraps Hono's cookie API with the framework's environment-based naming and defaults.

## Cookie Utility

```ts
import { cookie } from "@/framework/facade.js";
```

| Method                                 | Purpose                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cookie.setAuth(c, token)`             | Sets the access token cookie (`{COOKIE_NAME}_access`) with the configured access expiry. Use on login/register/refresh.    |
| `cookie.setRefresh(c, token, maxAge?)` | Sets the refresh token cookie (`{COOKIE_NAME}_refresh`) with the configured refresh expiry. Use on login/register/refresh. |
| `cookie.getAuth(c)`                    | Reads the access token cookie from the request context. Use in auth middleware or helpers.                                 |
| `cookie.getRefresh(c)`                 | Reads the refresh token cookie from the request context. Use in refresh/logout flows.                                      |
| `cookie.deleteAuth(c)`                 | Clears the access token cookie. Use on logout or invalid token.                                                            |
| `cookie.deleteRefresh(c)`              | Clears the refresh token cookie. Use on logout or invalid token.                                                           |

## Usage

### Set cookies on login

```ts
import { cookie } from "@/framework/facade.js";

cookie.setAuth(c, accessToken);
cookie.setRefresh(c, refreshToken);
// Optionally override refresh maxAge
cookie.setRefresh(c, refreshToken, 604800); // 7 days
```

### Read cookies in middleware

```ts
const accessToken = await cookie.getAuth(c);
const refreshToken = await cookie.getRefresh(c);
```

### Clear cookies on logout

```ts
cookie.deleteAuth(c);
cookie.deleteRefresh(c);
```

## Configuration

Cookie settings are in `src/config/cookie.ts`. The cookie name is a plain literal you can change there. Secrets stay in `.env`.

| Setting  | Default             | Description                                                   |
| -------- | ------------------- | ------------------------------------------------------------- |
| `name`   | `nexwire`            | Prefix for auth cookie names (`_access`, `_refresh` appended) |
| `secret` | `env.COOKIE_SECRET` | **Required.** Secret for cookie signing                       |

## Cross-origin cookies

When `APP_URL` and `FRONTEND_URL` are on different origins, cookies are set with `sameSite: "None"` and `secure: true`. Otherwise they use `sameSite: "Lax"`.

## Related config (`config/jwt.ts`)

| Setting                        | Default             | Description                              |
| ------------------------------ | ------------------- | ---------------------------------------- |
| `accessExpirySeconds`          | `900` (15 min)      | Max-Age for access cookie                |
| `refreshExpirySeconds`         | `3600` (1 hour)     | Default Max-Age for refresh cookie       |
| `refreshRememberExpirySeconds` | `2592000` (30 days) | Max-Age for "remember me" refresh cookie |

All cookies are httpOnly and scoped to `/`.
