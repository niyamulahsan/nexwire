# Providers

Provider files in this folder are imported automatically when the application
boots. Use them for anything the **whole app** needs — a replacement auth
implementation, a payment gateway, an SMS driver, a storage backend.

There is no wiring step: drop a file in here and it runs.

## How it works

1. Every `src/providers/**/*.{ts,js,mjs}` file is imported at boot.
2. Every `src/modules/<module>/providers.ts` file is imported at boot too, so a
   module can plug itself into the app without the app knowing about it.
3. A provider file claims a contract by registering an implementation.

```ts
// src/providers/payment.ts
import { registerProvider } from "@/framework/facade.js";

registerProvider("payment", {
  async charge(order) {
    return { id: "ch_123", status: "paid" };
  }
});
```

Read it back the same way:

```ts
import { getProvider } from "@/framework/facade.js";

const payment = getProvider<any>("payment");
```

## Replacing the built-in auth

The framework ships with an auth module under `src/modules/auth`. To replace
it, delete that folder and register your own auth provider:

```ts
// src/providers/auth.ts
import { registerAuthProvider } from "@/framework/facade.js";
import type { AuthProvider } from "@/framework/facade.js";

const authProvider: AuthProvider = {
  async getUserById(id) {
    // Return any user shape you like. Extra fields (tenantId, plan, status, ...)
    // are passed straight through to `c.get("auth")` / `res.locals.auth`.
    return { id, email: "user@example.com", tenantId: 42, plan: "pro" };
  },
  async findRefreshToken(jti) {
    // Return the stored refresh token, or null when it is unknown.
    return { id: 1, jti, revoked: false, expiresAt: new Date() };
  },
  async revokeRefreshToken(tokenId) {
    // Optional. Called when a refresh token is expired or revoked.
  },
  async getAuthContext(user, payload) {
    // Optional. Shapes what handlers receive as the auth context.
    return { id: user.id, email: user.email, tenantId: user.tenantId };
  },
  async getUserContact(userId) {
    // Optional. Used by `notify()` to find the email address of a user.
    return { email: "user@example.com", name: "User" };
  }
};

registerAuthProvider(authProvider);
```

Import `registerAuthProvider` and the `AuthProvider` type from
`@/framework/facade.js` — never from `@/framework/...` internals. The facade is
the public API of the framework.

## Module-to-module

Modules do not import each other. They talk through:

- `src/modules/<module>/facade.ts` — the public API of a module.
- `dispatchEvent` / `dispatchCommand` — for cross-module notifications.
- `src/providers/` — for app-wide implementations.

## Contract reference

| Method                              | Required | Purpose                                                        |
| ----------------------------------- | -------- | -------------------------------------------------------------- |
| `getUserById(id)`                   | Yes      | Loads a user. Any extra fields are passed through to the auth context. |
| `findRefreshToken(jti)`             | Yes      | Loads a stored refresh token by its JWT id.                    |
| `revokeRefreshToken(id)`            | No       | Revokes a refresh token. `deleteRefreshToken(id)` also works.  |
| `getAuthContext(user, payload)`     | No       | Shapes the object handlers receive as `auth`.                   |
| `getUserContact(userId)`            | No       | Finds the email/name of a user, used by notifications.         |

When no provider is registered and `src/modules/auth` was deleted, the auth
middleware logs a warning and lets the request through instead of crashing.
