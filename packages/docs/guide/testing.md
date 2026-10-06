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
      // No `thresholds` here. See "Coverage thresholds" below for why, and for
      // how to set one for your own project.
    },
  },
});
```

| Option          | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| **Globals**     | `true` — `describe`, `it`, `expect` available without imports |
| **Include**     | `src/**/*.test.ts`, `src/**/*.spec.ts`                        |
| **Exclude**     | UI resources, storage, node_modules, dist                     |
| **Environment** | `node`                                                        |
| **Path alias**  | `@` → `./src`                                                 |
| **Coverage**    | V8 provider, text + JSON + HTML reporters, with a floor       |

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

| Script          | Purpose                              |
| --------------- | ------------------------------------ |
| `test`          | Run all tests in watch mode          |
| `test:run`      | Run all tests once (CI mode)         |
| `test:coverage` | Run once and print a coverage report |
| `test:ui`       | Open Vitest visual UI in browser     |

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

## Coverage thresholds

Your new project's `vitest.config.ts` ships **without** a `thresholds` block, so `npm run test:coverage` always reports and never fails.

This is deliberate, and worth understanding before you add one. The coverage percentage includes the whole framework, not just your code — and the framework's own tests are not published with your project, because they test the framework rather than the application you are building. A brand new project therefore measures around **8.5%**, almost all of it framework code you did not write and cannot practically cover.

A threshold copied from the framework's repository (14%) would make `npm run test:coverage` fail on a fresh install, with every one of your tests passing, for a number you did not cause. That is a bad first experience, so the floor is kept on the framework side, in its own CI, where it guards the framework.

### Adding one to your project

Once you have written enough tests for your own code, a floor is genuinely useful: it stops you adding a module with no tests and lowering the number without noticing.

Set it in `vitest.config.ts`:

```ts
coverage: {
  // ...
  thresholds: {
    statements: 25,
    branches: 20,
    functions: 25,
    lines: 25,
  },
},
```

Or set it for one run without editing the file:

```bash
npm run test:run -- --coverage --coverage.thresholds.statements=25
```

Raise it in the same change as the tests that earned the increase. If your new tests take statements to 30%, set `statements: 30`.

::: warning Do not lower it
Lowering a threshold is the one edit that quietly removes the protection. If a test was deleted and coverage dropped, that is information worth keeping, not a number to edit away.
:::

### Coverage will not find your bug

A percentage counts lines that ran. It cannot see the failures that actually reach production:

- **A leaked resource.** Every line of a function that opens a connection, subscribes a listener, or starts a timer can be covered and still leak. Coverage has no way to count handles.
- **State that survives a request.** A rate-limit counter that never resets, or session data appearing in the next user's response, is fully covered code with a bug in it.
- **A wrong answer on an unusual input.** Two developers call the same function; only one gets the wrong result. That is a missing case, not a missing line.

For those, write the test that reproduces the specific failure — and for anything that holds a resource, assert on the resource. Count the connections, count the listeners, call it a hundred times and check nothing grew.
