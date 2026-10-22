# Provider Commands

Generate providers — the pluggable implementations the framework asks for instead of shipping one (auth, payments, SMS, storage).

## Requirements

A provider is a plain object registered under a key. The framework imports every provider file at boot, so there is no wiring step:

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

See [Providers](/guide/providers) for the whole mechanism.

## `provider:make <name>`

Generate an app-wide provider at `src/providers/<name>.ts`. The file registers itself when it is imported:

- `provider:make payment` → `src/providers/payment.ts` registering `"payment"`
- `provider:make payment-gateway` → `src/providers/payment-gateway.ts` registering `"payment-gateway"`

::: code-group

```bash [npm]
npm run maker provider:make payment
npm run maker provider:make payment -- --force
```

```bash [pnpm]
pnpm maker provider:make payment
pnpm maker provider:make payment --force
```

```bash [yarn]
yarn maker provider:make payment
yarn maker provider:make payment --force
```

```bash [bun]
bun maker provider:make payment
bun maker provider:make payment --force
```

:::

| Option      | Alias   | Description                                                       |
| ----------- | ------- | ----------------------------------------------------------------- |
| `--force`   | `--yes` | Overwrite an existing provider file (fails otherwise)              |
| `--dry-run` | —       | Validate the name and print what would be created without writing |

## `module:make-provider <module> [name]`

Generate a provider inside a module, at `src/modules/<module>/providers/<name>.ts`. Module providers are imported at boot too, so a module can offer an implementation to the whole application:

```bash
npm run maker module:make-provider billing stripe
```

```bash
npm run maker module:make-provider billing stripe -- --force
```

| Option      | Alias   | Description                                                       |
| ----------- | ------- | ----------------------------------------------------------------- |
| `--force`   | `--yes` | Overwrite an existing provider file (fails otherwise)              |
| `--dry-run` | —       | Validate the name and print what would be created without writing |
| `--path <panel>` | —   | Address a module inside a panel folder (e.g. `--path=admin`)      |

### Generated output

```ts
// src/modules/billing/providers/stripe.ts
import { registerProvider } from "@/framework/facade.js";

/**
 * Why: Plugs the stripe implementation into the application.
 * When: Imported automatically at boot - src/modules/*/providers/*.ts is.
 * Where: src/modules/billing/providers/stripe.ts
 *
 * Reach it from anywhere in the app:
 *
 *   import { getProvider } from "@/framework/facade.js";
 *   const stripe = getProvider<typeof stripeProvider>("stripe");
 *
 * Rule: a provider never imports another module's provider implementation.
 */
export const stripeProvider = {
  async handle(input: unknown) {
    return input;
  }
};

registerProvider("stripe", stripeProvider);
```

## Every new module gets a `providers.ts`

`module:make` writes a `providers.ts` next to the module's `facade.ts`. It starts empty and documents where the module's registrations belong:

```ts
// src/modules/billing/providers.ts
/**
 * Providers for the billing module.
 *
 * This file is imported automatically at boot, so whatever it registers is
 * available to the whole application:
 *
 *   import { registerProvider } from "@/framework/facade.js";
 *
 *   registerProvider("billing", { ... });
 *
 * A module with more than one provider keeps them in providers/*.ts instead -
 * those files are imported at boot too.
 *
 * Rule: a module never imports another module's provider implementation.
 */

export {};
```

## Related

- [Providers](/guide/providers) — the provider mechanism.
- [Module Commands](/cli/module) — the full `maker module:*` reference.
- [Middleware Commands](/cli/middleware) — the other generator with a global and a module-scoped form.
