# Unit Testing

nexwire uses [Vitest](https://vitest.dev/) as the built-in testing framework. Tests run on Node.js with globals enabled — you don't need to import `describe`, `it`, or `expect`.

## Quick Start

Create a test file anywhere under `src/` with `.test.ts` or `.spec.ts` extension:

```ts
// src/modules/posts/posts.test.ts
import { describe, it, expect } from "vitest";

describe("posts", () => {
  it("should add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("should filter active posts", () => {
    const posts = [
      { id: 1, active: true },
      { id: 2, active: false },
      { id: 3, active: true },
    ];
    const active = posts.filter((p) => p.active);
    expect(active).toHaveLength(2);
  });
});
```

Run it:

::: code-group

```bash [npm]
npm run test:run
```

```bash [pnpm]
pnpm run test:run
```

```bash [yarn]
yarn run test:run
```

```bash [bun]
bun run test:run
```

:::

## Configuration

Vitest is pre-configured in `vitest.config.ts` at your project root:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["src/resources/**", "src/storage/**", "node_modules/**", "dist/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/resources/**",
        "src/storage/**",
        "src/framework/maker-cli/**",
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
      ],
    },
  },
});
```

| Option | Value |
|---|---|
| **Globals** | `true` — `describe`, `it`, `expect` available without imports |
| **Include** | `src/**/*.test.ts`, `src/**/*.spec.ts` |
| **Exclude** | UI resources, storage, node_modules, dist |
| **Environment** | `node` |
| **Path alias** | `@` → `./src` |
| **Coverage** | V8 provider, text + JSON + HTML reporters |

## Writing Tests

### Basic assertions

```ts
import { describe, it, expect } from "vitest";

describe("string utils", () => {
  it("should uppercase", () => {
    expect("hello".toUpperCase()).toBe("HELLO");
  });

  it("should check existence", () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect("value").toBeTruthy();
  });
});
```

### Async tests

```ts
describe("database", () => {
  it("should fetch users", async () => {
    const users = await db.select().from(usersTable).execute();
    expect(users).toBeInstanceOf(Array);
  });
});
```

### Testing with path aliases

The `@` alias works in tests — same as in your application code:

```ts
import { cache, password } from "@/framework/facade.js";
```

### Testing modules

Place test files inside the module's `__tests__` directory. Use the CLI to scaffold them:

```bash
npm run maker module:make-test posts
```

This creates:

```
src/
  modules/
    posts/
      controllers/
        posts.controller.ts
      routes/
        api.ts
      __tests__/
        posts.test.ts       ← generated test file
```

You can also specify a custom test name:

```bash
npm run maker module:make-test posts user-test
```

This creates `__tests__/user-test.test.ts` instead.

## Running Tests

### Scripts

| Script | Purpose |
|---|---|
| `test` | Run all tests in watch mode |
| `test:run` | Run all tests once (CI mode) |
| `test:coverage` | Run with code coverage report |
| `test:ui` | Open Vitest visual UI in browser |

::: code-group

```bash [npm]
npm run test
npm run test:run
npm run test:coverage
npm run test:ui
```

```bash [pnpm]
pnpm run test
pnpm run test:run
pnpm run test:coverage
pnpm run test:ui
```

```bash [yarn]
yarn run test
yarn run test:run
yarn run test:coverage
yarn run test:ui
```

```bash [bun]
bun run test
bun run test:run
bun run test:coverage
bun run test:ui
```

:::

### Filter tests

Run only specific test files or test names:

```bash
# Run tests matching a file pattern
npx vitest run posts

# Run tests matching a test name
npx vitest run -t "should add"
```

### Using maker CLI

The maker CLI wraps these commands:

::: code-group

```bash [npm]
npm run maker test
npm run maker test:watch
npm run maker test:coverage
npm run maker test:ui
npm run maker module:make-test posts
```

```bash [pnpm]
pnpm maker test
pnpm maker test:watch
pnpm maker test:coverage
pnpm maker test:ui
pnpm maker module:make-test posts
```

```bash [yarn]
yarn maker test
yarn maker test:watch
yarn maker test:coverage
yarn maker test:ui
yarn maker module:make-test posts
```

```bash [bun]
bun maker test
bun maker test:watch
bun maker test:coverage
bun maker test:ui
bun maker module:make-test posts
```

:::

## Coverage

Run coverage to see which parts of your code are tested:

```bash
npm run test:coverage
```

Output includes:

- **Text** — summary printed to terminal
- **JSON** — machine-readable report at `coverage/coverage-final.json`
- **HTML** — browsable report at `coverage/index.html`

Coverage includes all `src/**/*.ts` files except UI resources, storage, maker-cli internals, and test files themselves.
