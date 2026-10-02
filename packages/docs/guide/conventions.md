# Conventions

How files are named, where they live, and how modules talk to each other.

## The one principle

> **Directory = meaning. Suffix = readability.**

The framework discovers files by **directory**, never by filename. Every glob is
extension-agnostic:

```ts
discoverModuleFiles("**/routes/*.{ts,js}")
discoverModuleFiles("**/jobs/*.{ts,js}")
discoverModuleFiles("**/database/models/*.{ts,js}")
discoverModuleFiles("**/{schedules,console}/*.{ts,js}")
```

So the folder is what makes a file work. The `.controller.ts` / `.service.ts`
suffix is a readability aid only — any filename inside the right folder is valid.

::: warning Don't switch to suffix-based discovery
Writing `**\/*.model.ts` instead of `**/database/models/*` would break every
existing module. Directory stays king.
:::

## Directory table

All paths are relative to `src/modules/<module>/`.

| Kind       | Directory            | Suffix           | Example              |
| ---------- | -------------------- | ---------------- | -------------------- |
| route      | `routes/`            | `.route.ts`      | `index.route.ts`     |
| controller | `controllers/`       | `.controller.ts` | `post.controller.ts` |
| schema     | `controllers/`       | `.schema.ts`     | `post.schema.ts`     |
| helper     | `helpers/`           | `.helper.ts`     | `post.helpers.ts`    |
| service    | `services/`          | `.service.ts`    | `post.service.ts`    |
| middleware | `middlewares/`       | `.middleware.ts` | `auth.middleware.ts` |
| model      | `database/models/`   | `.model.ts`      | `post.ts`            |
| seeder     | `database/seeders/`  | `.seed.ts`       | `post.ts`            |
| job        | `jobs/`              | `.job.ts`        | `processComment.ts`  |
| schedule   | `console/`           | `.schedule.ts`   | `cleanup.ts`         |
| test       | `__tests__/`         | `.test.ts`       | `post.test.ts`       |
| **facade** | `facade.ts` (root)   | —                | `facade.ts`          |

A scaffolded module looks like this:

```
src/modules/blog/
├── facade.ts
├── controllers/
│   ├── post.controller.ts
│   └── post.schema.ts
├── helpers/
│   ├── .gitkeep
│   └── post.helpers.ts
├── services/
│   └── .gitkeep
├── middlewares/
│   └── .gitkeep
├── routes/
│   ├── api.ts
│   └── plain.ts
├── database/
│   ├── models/
│   └── seeders/
├── jobs/
├── console/
└── __tests__/
```

::: tip Use the `@/` alias, always
Every import inside `src/modules/` uses the `@/` alias, including files in the
same module:

```ts
// ✅ both of these
import { postController } from "@/modules/blog/controllers/post.controller.js";
import { postHelpers } from "@/modules/blog/helpers/post.helpers.js";
```

Relative paths (`./`, `../`) are not used in module code. The alias keeps paths
stable when you move a file between folders.

`helpers/`, `services/`, and `middlewares/` are created empty (`.gitkeep`) by
default — fill them with the matching `module:make-*` command when needed.
:::

## helper vs service — not the same

|         | Test                                   | Examples                                                    |
| ------- | -------------------------------------- | ----------------------------------------------------------- |
| helper  | pure computation, **no I/O**           | `slugify("Hi There")` → `"hi-there"`<br/>`hasRole(u, ["admin"])` → `true` |
| service | **does** something — DB, files, network | `sendPasswordEmail(user)`<br/>`createOrder(data)`           |

> **helper = computes. service = does.**

If it touches the database, the filesystem, or the network, it is a service.
Helpers stay trivially testable because they cannot fail on I/O.

## Module facades

A `facade.ts` is a module's **public API** — the single door other modules knock on.
It mirrors `framework/facade.ts`, whose own docblock already says
_"App-layer imports should target this file."_

```ts
// src/modules/auth/facade.ts
export { hasRole, getCurrentUser } from "./helpers/auth.helpers.js";
export { createAuthSchema } from "./controllers/auth.schema.js";
```

Other modules import from the door:

```ts
// ✅ through the door
import { hasRole } from "@/modules/auth/facade.js";

// ❌ reaching into internals — breaks the moment you refactor
import { hasRole } from "@/modules/auth/helpers/auth.helpers.js";
```

### The two rules

> **Rule 1 — Modules talk to each other ONLY through facades.**
> **Rule 2 — Facades NEVER import other facades.**

Rule 2 exists because a facade re-exports *everything* in its module, so
`A/facade.ts → B/facade.ts → A/facade.ts` loops trivially.

```
✅ WORKS
   A/facade.ts ──► B/helpers/tax.ts      (single file, NOT the facade)
   B/facade.ts ──► A/helpers/user.ts     (single file, NOT the facade)

❌ BREAKS
   A/facade.ts ──► B/facade.ts ──► A/facade.ts
```

**Escape hatch:** anything you want to share goes in the facade. If a facade
genuinely needs one file from another module, it imports that **single file** —
never the other facade.

### Inside vs outside a module

| From                                      | To                              |   |
| ----------------------------------------- | ------------------------------- | - |
| `modules/auth/controllers/a.ts`           | `modules/auth/controllers/b.ts` | ✅ same module, direct |
| `modules/admin/post/…`                    | `modules/auth/facade.ts`        | ✅ through the door |
| `modules/auth/facade.ts`                  | `modules/auth/facade.ts`        | ❌ rule 1 |
| `modules/auth/facade.ts`                  | `modules/billing/facade.ts`     | ❌ rule 2 |
| `modules/blog/controllers/a.ts`           | `modules/blog/services/b.ts`    | ✅ same module, direct |

### Decision guide

| Where does the logic live?                              | Where does it go?                   |
| ------------------------------------------------------- | ----------------------------------- |
| Only used inside one module                             | that module, beside its caller      |
| Auth-flavored, needed by most modules                   | `auth` module → export via facade   |
| Generic, needed by 2+ modules                           | `src/modules/shared/`               |
| Framework-stable, every app needs (`db`, `jwt`, `mail`) | `@/framework/facade.js`             |

::: tip Why facades exist
Rule 1 is the same bug this framework already hit: `config/session.ts` imported
`config/index.js`, which re-exported session. A cycle that only works because
the import happens to resolve before first use — until it doesn't. Facades make
the "public surface" explicit so the cycle checker can enforce it.
:::

## Circular imports

**Database models are exempt.** Drizzle's `relations()` defers cross-references
into lazy callbacks, so `user.ts` ↔ `role.ts` must import each other. That
mutual reference is structural, not accidental.

Everything else must be acyclic. The check runs with `dpdm`:

```bash
npm run check:cycles
```

Models are skipped; `src/resources/**` (the Vue app) is excluded because it is
not part of the module graph.

## Related

- [Modules](/guide/modules) — creating modules and components
- [Architecture](/guide/architecture) — full project layout
- [Module Commands](/cli/module) — the `maker module:*` commands