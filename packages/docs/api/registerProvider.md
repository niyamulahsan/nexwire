# `registerProvider` — provider registry

Imported from the facade: `import { registerProvider } from "@/framework/facade.js"`.

Registers an implementation under a key so the framework — or your own code — can ask for it later. This is how an application replaces a framework default (auth today, payments or SMS drivers tomorrow) without the framework importing application code. See [Providers](./../guide/providers).

## Functions

| Function | Signature | Description |
| -------- | --------- | ----------- |
| `registerProvider` | `(key, impl) => impl` | Registers an implementation under a key and returns it |
| `registerAuthProvider` | `(provider) => provider` | Typed shorthand for the `auth` key |
| `registerNotificationProvider` | `(provider) => provider` | Typed shorthand for the `notification` key |
| `hasProvider` | `(key) => boolean` | Reports whether an implementation is registered |
| `clearProvider` | `(key) => void` | Removes an implementation — mainly useful in tests |
| `clearAuthProvider` | `() => void` | Removes the auth provider — mainly useful in tests |
| `clearNotificationProvider` | `() => void` | Removes the notification provider — mainly useful in tests |
| `listProviders` | `() => string[]` | Lists every registered key |

## Use cases

### Replace the built-in auth

```ts
// src/providers/auth.ts
import { registerAuthProvider } from "@/framework/facade.js";
import type { AuthProvider } from "@/framework/facade.js";

const authProvider: AuthProvider = {
  async getUserById(id) {
    return { id, email: "user@example.com", tenantId: 42, plan: "pro" };
  },
  async findRefreshToken(jti) {
    return { id: 1, jti, revoked: false, expiresAt: new Date() };
  },
  async getUserContact(userId) {
    return { email: "user@example.com", name: "User" };
  }
};

registerAuthProvider(authProvider);
```

Files in `src/providers/` are imported automatically at boot — no import of this module is needed anywhere else.

### Replace notification storage

```ts
// src/providers/notification.ts
import { registerNotificationProvider } from "@/framework/facade.js";
import type { NotificationProvider } from "@/framework/facade.js";

const notificationProvider: NotificationProvider = {
  async create(target, input) {
    // persist and return a NotificationRecord
  },
  async list(target, options) {},
  async unreadCount(target) {},
  async markRead(target, id) {},
  async markAllRead(target) {},
  async remove(target, id) {}
};

registerNotificationProvider(notificationProvider);
```

A registered notification provider always wins over the generated `src/modules/notification` store. Mail and realtime remain in the runtime, so `notify({ broadcast, mail })` keeps working.

### Register your own contract

```ts
// src/providers/payment.ts
import { registerProvider } from "@/framework/facade.js";

export const payment = registerProvider("payment", {
  async charge(order) {
    return { id: "ch_123", status: "paid" };
  }
});
```

### Register from a module

```ts
// src/modules/billing/providers.ts
import { registerProvider } from "@/framework/facade.js";

registerProvider("billing", {
  async invoice(order) {
    return { id: "inv_1" };
  }
});
```

Module provider files are imported at boot too, so a module can ship its own implementation.

## `AuthProvider` contract

| Method | Required | Purpose |
| ------ | -------- | ------- |
| `getUserById(id)` | Yes | Loads a user. Extra fields are passed through to the auth context. |
| `findRefreshToken(jti)` | Yes | Loads a stored refresh token by its JWT id. |
| `revokeRefreshToken(id)` | No | Revokes a refresh token. `deleteRefreshToken(id)` also works. |
| `getAuthContext(user, payload)` | No | Shapes the object handlers receive as `auth`. |
| `getUserContact(userId)` | No | Finds the email/name of a user — used by `notify()`. |

Every id in the contract (`AuthProviderUser.id`, `AuthUserContext.id`, refresh-token ids, and the `getUserById` / `getUserContact` arguments) is `number | string`, so a UUID-backed auth provider is fully supported.

### `NotificationProvider` contract

| Method | Required | Purpose |
| ------ | -------- | ------- |
| `create(target, input)` | Yes | Store one notification and return it. |
| `list(target, options)` | Yes | Return `{ data, total, unread, page, perPage }`. |
| `unreadCount(target)` | Yes | Return the unread count. |
| `markRead(target, id)` | Yes | Mark one read; return whether it existed. |
| `markAllRead(target)` | Yes | Mark all read; return how many changed. |
| `remove(target, id)` | Yes | Delete one; return whether it existed. |
| `deleteForTarget(target)` | No | Delete everything owned by a target. |

## Notes

- The facade is the framework's public API. Never import from `@/framework/...` internals.
- When no auth provider is registered, the framework falls back to the built-in one from `src/modules/auth`. When that module was deleted as well, the auth middleware logs a warning and lets the request through instead of crashing.
- Registration happens before routes are mounted, so a provider is available to route guards, middleware and seeders.

## Related

- [getProvider](./getProvider) — read a registered implementation
- [Providers](./../guide/providers) — the full guide
- [Authentication](./../guide/auth) — the built-in auth provider
