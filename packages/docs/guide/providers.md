# Providers

## Overview

A **provider** is an implementation the framework asks for instead of shipping one. The built-in auth module is one. A payment gateway, an SMS driver or a custom user store can be others.

The rule is simple:

> The framework never imports your application code. Your application registers an implementation, the framework consumes it through a contract.

There is **no container, no decorators and no auto-wiring**. A provider is a plain object registered under a key.

## Where providers live

| Location              | Scope                                    | Imported                        |
| --------------------- | ---------------------------------------- | ------------------------------- |
| `src/providers/**`    | The whole application                    | Automatically, at boot          |
| `src/modules/<m>/providers.ts` | One module, plugged into the app | Automatically, at boot          |
| `src/modules/<m>/providers/*.ts` | One module, several implementations | Automatically, at boot |

All three are discovered by the framework at startup. Drop a file in and it runs — there is nothing to edit in `app.ts`, and nothing to import from `@/framework/...` internals.

The scaffold ships an empty `src/providers/` folder with a short `README.md` next to it, and every new module gets a `providers.ts` next to its `facade.ts`.

### Generating one

```bash
npm run maker provider:make payment          # -> src/providers/payment.ts
npm run maker module:make-provider billing stripe  # -> src/modules/billing/providers/stripe.ts
```

`provider:make` writes an app-wide provider, `module:make-provider` writes one inside a module. Both files register themselves when they are imported. See [Provider Commands](../cli/provider).

## Registering an implementation

Every provider is registered under a key:

```ts
// src/providers/payment.ts
import { registerProvider } from "@/framework/facade.js";

registerProvider("payment", {
  async charge(order) {
    return { id: "ch_123", status: "paid" };
  }
});
```

And read back the same way:

```ts
import { getProvider } from "@/framework/facade.js";

const payment = getProvider<any>("payment");
```

`registerProvider()` returns the implementation, so it can be inlined:

```ts
export const payment = registerProvider("payment", {
  async charge(order) {
    return { id: "ch_123", status: "paid" };
  }
});
```

## The built-in auth contract

`auth` is the key nexwire ships with. Its contract is `AuthProvider`:

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
  async revokeRefreshToken(tokenId) {},
  async getAuthContext(user, payload) {
    return { id: user.id, email: user.email, tenantId: user.tenantId };
  },
  async getUserContact(userId) {
    return { email: "user@example.com", name: "User" };
  }
};

registerAuthProvider(authProvider);
```

| Method | Required | Purpose |
| --- | --- | --- |
| `getUserById(id)` | Yes | Loads a user. Extra fields are passed through to the auth context. |
| `findRefreshToken(jti)` | Yes | Loads a stored refresh token by its JWT id. |
| `revokeRefreshToken(id)` | No | Revokes a refresh token. `deleteRefreshToken(id)` also works. |
| `getAuthContext(user, payload)` | No | Shapes the object handlers receive as `auth`. |
| `getUserContact(userId)` | No | Finds the email/name of a user — used by `notify()`. |

When no auth provider is registered, the framework falls back to the built-in one from `src/modules/auth`. Delete that module and register your own to take over completely — see [Authentication](./auth).

## Module providers

A module can plug itself into the application the same way:

```ts
// src/modules/billing/providers.ts
import { registerProvider } from "@/framework/facade.js";

registerProvider("billing", {
  async invoice(order) {
    return { id: "inv_1" };
  }
});
```

When a module offers more than one implementation, they live in its `providers/` folder — those files are imported at boot as well:

```ts
// src/modules/billing/providers/stripe.ts
import { registerProvider } from "@/framework/facade.js";

registerProvider("stripe", {
  async charge(order) {
    return { id: "ch_123" };
  }
});
```

The module ships the implementation, the application decides to use it. Nothing in `src/modules/billing/` has to know whether the app consumed it.

## Module-to-module communication

Modules do not import each other. There are three ways to talk:

| Need                                      | Mechanism                              |
| ----------------------------------------- | -------------------------------------- |
| Call something another module owns        | That module's `facade.ts`             |
| Notify another module something happened  | `dispatchEvent` / `dispatchCommand`    |
| Swap an implementation                    | A provider                             |

A module's `facade.ts` is its public API — other modules import from it, never from its controllers or services:

```ts
// src/modules/billing/facade.ts
export { createInvoice } from "./services/invoice.service.js";
```

```ts
// src/modules/orders/controllers/order.controller.ts
import { createInvoice } from "@/modules/billing/facade.js";
```

When one module only needs to react to another, use an event rather than an import — the two modules then stay independent:

```ts
// src/modules/orders/controllers/order.controller.ts
import { dispatchEvent } from "@/framework/facade.js";

await dispatchEvent("order.created", { orderId });
```

```ts
// src/modules/billing/providers.ts
import { registerProvider } from "@/framework/facade.js";
import { dispatchEvent } from "@/framework/facade.js";

registerProvider("billing", {
  async onOrderCreated(payload) {
    // react to the event
  }
});
```

## API

| Function | Purpose |
| --- | --- |
| `registerProvider(key, impl)` | Registers an implementation under a key and returns it. |
| `getProvider(key)` | Returns the implementation, or `null`. |
| `hasProvider(key)` | Reports whether an implementation is registered. |
| `clearProvider(key)` | Removes it — mainly useful in tests. |
| `listProviders()` | Lists every registered key. |
| `registerAuthProvider(impl)` | Typed shorthand for the `auth` key. |
| `getAuthProvider()` | The registered auth provider, or `null`. |
| `hasAuthProvider()` | Reports whether an auth provider is registered. |
| `clearAuthProvider()` | Removes it — mainly useful in tests. |
| `loadProviders()` | Imports the provider files. Called by the framework at boot. |

All of them are imported from the facade:

```ts
import { registerProvider, getProvider, hasProvider, clearProvider, listProviders, registerAuthProvider, getAuthProvider, hasAuthProvider, clearAuthProvider } from "@/framework/facade.js";
```

## Notes

- Provider files are imported once per process. A file that throws is logged and skipped — it does not take the application down.
- Registration happens before routes are mounted, so a provider is available to route guards, middleware and seeders.
- The framework never imports `@/framework/...` internals into your code, and your code never needs to import framework internals either: the facade is the public API.

## Related

- [Authentication](./auth) — the built-in auth provider and its contract.
- [Modules](./modules) — how modules are structured.
- [Provider Commands](../cli/provider) — `provider:make` and `module:make-provider`.
- [Events & Queue](./events-queue) — `dispatchEvent` / `dispatchCommand`.
