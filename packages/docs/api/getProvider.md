# `getProvider` — read a registered implementation

Imported from the facade: `import { getProvider } from "@/framework/facade.js"`.

Returns the implementation registered under a key, or `null` when there is none. See [Providers](./../guide/providers).

## Functions

| Function | Signature | Description |
| -------- | --------- | ----------- |
| `getProvider` | `(key) => impl \| null` | Returns the implementation registered under a key |
| `getAuthProvider` | `() => AuthProvider \| null` | The registered auth provider, or `null` |
| `getNotificationProvider` | `() => NotificationProvider \| null` | The registered notification provider, or `null` |
| `hasProvider` | `(key) => boolean` | Reports whether an implementation is registered |
| `hasAuthProvider` | `() => boolean` | Reports whether an auth provider is registered |
| `hasNotificationProvider` | `() => boolean` | Reports whether a notification provider is registered |
| `listProviders` | `() => string[]` | Lists every registered key |
| `resolveAuthProvider` | `() => Promise<AuthProvider \| null>` | Registered auth provider, else the built-in one |
| `resolveNotificationProvider` | `() => Promise<NotificationProvider \| null>` | Registered notification provider, else `null` |

## Use cases

### Read your own provider

```ts
import { getProvider } from "@/framework/facade.js";

const payment = getProvider<any>("payment");

if (payment) {
  await payment.charge({ amount: 100 });
}
```

### Check whether an auth provider was registered

```ts
import { getAuthProvider, hasAuthProvider } from "@/framework/facade.js";

if (hasAuthProvider()) {
  const provider = getAuthProvider();
}
```

### Guard a call in a test

```ts
import { clearAuthProvider, getAuthProvider } from "@/framework/facade.js";

afterEach(() => {
  clearAuthProvider();
});

it("uses the registered provider", async () => {
  getAuthProvider();
});
```

## Notes

- `getProvider()` returns `null` for a key that was never registered — it never throws.
- The built-in auth implementation is **not** in the registry. It is resolved as a fallback by `resolveAuthProvider()` when no provider was registered, so `getAuthProvider()` returns `null` even though the shipped auth module still works.
- The notification module is opt-in and its provider registers itself when generated, so `getNotificationProvider()` is `null` until `module:make-notification` has run (or another provider was registered).
- Provider files in `src/providers/` are imported automatically at boot.

## Related

- [registerProvider](./registerProvider) — register an implementation
- [Providers](./../guide/providers) — the full guide
