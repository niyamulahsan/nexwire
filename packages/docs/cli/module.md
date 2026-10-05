# Module Commands

Generate and manage modules — the building blocks of your application. Each module is a self-contained directory under `src/modules/` with its own controllers, routes, schemas, services, helpers, middlewares, types, models, jobs, and seeders.

::: code-group

```bash [npm]
npm run maker <command> [options]
```

```bash [pnpm]
pnpm maker <command> [options]
```

```bash [yarn]
yarn maker <command> [options]
```

```bash [bun]
bun maker <command> [options]
```

:::

## Naming

Every command takes a name in any casing you like. The CLI folds it to one
canonical form and derives four shapes from it, so `gameConfig`, `GameConfig`,
`game_config` and `game-config` all produce exactly the same files.

| Used for | Form | Example |
| --- | --- | --- |
| File name and import path | kebab-case | `game-config.ts` |
| Table in the database | snake_case | `game_configs` |
| Variable in code | camelCase | `gameConfigs` |
| Class and schema names | PascalCase | `GameConfigSeeder` |

These forms were always the convention; from 4.2.0 the generators enforce them
instead of writing whatever you typed.

### What gets normalised

| You type | Canonical name |
| --- | --- |
| `game-config` | `game-config` |
| `game_config` | `game-config` |
| `game-SUITE`, `GAME-SUITE` | `game-suite` |
| `gameSuite`, `GameSuite` | `game-suite` |
| `game-config_2` | `game-config-2` |
| `gamesuite`, `GAMESUITE` | `gamesuite` |
| `gamE-SUITE-Engine` | `gam-e-suite-engine` |

Two rules produce that last row. A capital inside a word marks a boundary, the
same way it does in `gameSuite` — so the `E` in `gamE` splits it into `gam` and
`e`, and the result keeps that capital in the PascalCase form
(`GamESuiteEngine`). A word written without any separator carries no boundary at
all, so `gamesuite` stays a single word rather than guessing where `game` ends.

Both readings are valid TypeScript and produce the same file every time, and any
later casing of the same words resolves back to the module you already created:

```bash
bun maker module:make gamE-SUITE-Engine   # creates src/modules/gam-e-suite-engine
bun maker module:make-model GAM-E-SUITE-ENGINE game-config   # same module
```

Normalisation only folds separators and case. A name that cannot become a safe
identifier is still rejected, with a suggestion, e.g. `game config` → *"Use
\"game-config\" instead."*

### Table name pluralisation

The SQL table name is the plural of the model name. The rule is deliberately
small: a consonant followed by `y` becomes `ies`, anything else takes a plain
`s`.

| Model name | Table | Exported identifier |
| --- | --- | --- |
| `spin` | `spins` | `spins` |
| `audit-entry` | `audit_entries` | `auditEntries` |
| `game-config` | `game_configs` | `gameConfigs` |
| `ledger-entry` | `ledger_entries` | `ledgerEntries` |

English irregulars (`person` → `people`, `address` → `addresses`) are not
modelled. If your model needs one, rename the table and the export by hand
after generating.

::: warning Upgrading from before 4.2.0
If you generated a multi-word name before 4.2.0, the files it produced do not
compile — the name was written into identifier positions, so
`game-configService` was read as subtraction. Re-run the generator with
`--force` to regenerate them:

```bash
npm run maker module:make-model <module> game-config --force
npm run maker module:make-seeder <module> game-config --force
```

`--force` only rewrites files; it never renames or deletes anything. A module
folder that uses an older separator (for example `game_config` rather than
`game-config`) is still found, so existing projects keep working without being
renamed.
:::

## Scaffold Commands

### `module:make <name>`

Create a complete module with all default scaffolding. Pass several names to create multiple modules in one run, or `--path=<panel>` to nest the module under a panel folder.

| Generated  | Path                                            |
| ---------- | ----------------------------------------------- |
| Facade     | `src/modules/<name>/facade.ts`                  |
| Controller | `src/modules/<name>/controllers/<name>.ts`      |
| Schema     | `src/modules/<name>/schemas/<name>.ts`          |
| Service    | `src/modules/<name>/services/<name>.ts`         |
| Route      | `src/modules/<name>/routes/index.ts`            |
| Model      | `src/modules/<name>/database/models/<name>.ts`  |
| Seeder     | `src/modules/<name>/database/seeders/<name>.ts` |

```
src/modules/posts/
├── controllers/
│   └── posts.ts
├── database/
│   ├── models/
│   │   └── posts.ts
│   └── seeders/
│       └── posts.ts
├── routes/
│   └── index.ts
├── schemas/
│   └── posts.ts
├── services/
│   └── posts.ts
└── facade.ts
```

The controller, schema, service and route adapt to the `OPEN_API` environment variable at scaffold time — see [OpenAPI Mode](/guide/modules#openapi-mode).

### `module:make-notification [name]`

Generate a notification backend module with controller, routes, and job. Default name is `notification`.

| File                          | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `controllers/notification.ts` | 5 handlers: list, unreadCount, markRead, markAllRead, remove |
| `schemas/notification.ts`     | Zod/OpenAPI schemas                                          |
| `routes/index.ts`             | 5 routes under `authMiddleware`                              |
| `jobs/notification.ts`        | Queue handler for email delivery                             |

::: tip
UI integration is manual  see [Notification Guide](/guide/notification) for Vue copy-paste components and setup instructions.
:::

## Component Commands

Add individual components to an existing module. All support `--force` (overwrite), `--dry-run` (preview) and `--path=<panel>` (address a module inside a panel folder).

### `module:make-route <module> [controller]`

Generate a standalone route file for an existing module. Without a name it writes `routes/index.ts`; with a name it writes `routes/<name>.ts`. The stub ships with placeholder handlers — wire it to a controller and schemas when ready.

::: code-group

```bash [npm]
npm run maker module:make-route posts
npm run maker module:make-route posts custom-controller
```

```bash [pnpm]
pnpm maker module:make-route posts
pnpm maker module:make-route posts custom-controller
```

```bash [yarn]
yarn maker module:make-route posts
yarn maker module:make-route posts custom-controller
```

```bash [bun]
bun maker module:make-route posts
bun maker module:make-route posts custom-controller
```

:::

### `module:make-controller <module> [name]`

Generate a controller file at `controllers/<name>.ts`. If no name given, uses the module name. When a matching `services/<name>.ts` exists (or the legacy `controllers/<name>.service.ts`), the controller delegates to that service; otherwise it gets standalone handlers.

::: code-group

```bash [npm]
npm run maker module:make-controller posts
npm run maker module:make-controller posts admin
```

```bash [pnpm]
pnpm maker module:make-controller posts
pnpm maker module:make-controller posts admin
```

```bash [yarn]
yarn maker module:make-controller posts
yarn maker module:make-controller posts admin
```

```bash [bun]
bun maker module:make-controller posts
bun maker module:make-controller posts admin
```

:::

### `module:make-model <module> [name]`

Generate a Drizzle model file with dialect-aware schema (MySQL, Postgres, or SQLite). Auto-detects your database dialect from `DATABASE_URL`.

::: code-group

```bash [npm]
npm run maker module:make-model posts
```

```bash [pnpm]
pnpm maker module:make-model posts
```

```bash [yarn]
yarn maker module:make-model posts
```

```bash [bun]
bun maker module:make-model posts
```

:::

### `module:make-seeder <module> [name]`

Generate a seeder file at `database/seeders/<name>.ts`.

**If a model called `<name>` exists** in that module, the seeder is wired to it: the model is imported, `table` is exported, and the insert loop is pre-filled. When `<name>` does not match a model but the module has its own model, that one is used instead and the CLI says so.

**If no matching model exists**, the seeder is still generated, as a *standalone* seeder that imports no model and inserts nothing until you fill it in. The CLI prints what it found and what to do next:

```bash
bun maker module:make-seeder game-suite xyz
```

```
No model 'xyz' in module game-suite, so this is a standalone seeder: it imports
no model and writes nothing until you fill it in.
  Models in this module: abc. Run module:make-seeder game-suite <one of these>
  for a seeder with the model already imported.
Seeder ready: game-suite/xyz
```

This is deliberate. A seeder does not have to belong to the module that owns the table it writes to, and does not have to write to only one table — so the three reasonable requests below are all supported:

```bash
# 1. seed a table owned by ANOTHER module: generate here, then import that
#    module's model yourself
bun maker module:make-seeder game-suite posts

# 2. assemble rows from several models: same thing, several imports
bun maker module:make-seeder game-suite sign-up-flow

# 3. seed a table whose model does not exist yet
bun maker module:make-seeder game-suite post-comments
```

A standalone seeder lives in the module you named, so `module:seed <module>` is what runs it. If you want `module:seed posts` to seed the `posts` table, generate the seeder in `posts` instead — that keeps "which module owns this seeder" and "which table does it write" aligned. Every other generator makes the same trade when its dependency is missing: a controller with no service falls back to a standalone shape, and a service with no model falls back to a plain one.

::: code-group

```bash [npm]
npm run maker module:make-seeder posts
```

```bash [pnpm]
pnpm maker module:make-seeder posts
```

```bash [yarn]
yarn maker module:make-seeder posts
```

```bash [bun]
bun maker module:make-seeder posts
```

:::

### `module:make-schema <module> [name]`

Generate a schema file at `schemas/<name>.ts`. The generated set depends on the `OPEN_API` setting at scaffold time — full (item, create, update, id-params and response schemas) or minimal (create, update and id-params only).

::: code-group

```bash [npm]
npm run maker module:make-schema posts
npm run maker module:make-schema posts publish
```

```bash [pnpm]
pnpm maker module:make-schema posts
pnpm maker module:make-schema posts publish
```

```bash [yarn]
yarn maker module:make-schema posts
yarn maker module:make-schema posts publish
```

```bash [bun]
bun maker module:make-schema posts
bun maker module:make-schema posts publish
```

:::

### `module:make-service <module> [name]`

Generate a service file at `services/<name>.ts`. The service is Drizzle-backed when `database/models/<name>.ts` exists or when `--with-model` is passed; otherwise it ships with `TODO` placeholders where the queries go.

::: code-group

```bash [npm]
npm run maker module:make-service posts
npm run maker module:make-service posts publish
```

```bash [pnpm]
pnpm maker module:make-service posts
pnpm maker module:make-service posts publish
```

```bash [yarn]
yarn maker module:make-service posts
yarn maker module:make-service posts publish
```

```bash [bun]
bun maker module:make-service posts
bun maker module:make-service posts publish
bun maker module:make-service posts publish --with-model
```

:::

### `module:make-helper <module> [name]`

Generate a helper file at `helpers/<name>.ts` — pure logic with no I/O, safe to call from controllers, services, jobs and other helpers.

::: code-group

```bash [npm]
npm run maker module:make-helper posts format
```

```bash [pnpm]
pnpm maker module:make-helper posts format
```

```bash [yarn]
yarn maker module:make-helper posts format
```

```bash [bun]
bun maker module:make-helper posts format
```

:::

### `module:make-middleware <module> [name]`

Generate a module-local middleware file at `middlewares/<name>.ts`. Register it on a route or route group inside `routes/*.ts`.

::: code-group

```bash [npm]
npm run maker module:make-middleware posts auth-check
```

```bash [pnpm]
pnpm maker module:make-middleware posts auth-check
```

```bash [yarn]
yarn maker module:make-middleware posts auth-check
```

```bash [bun]
bun maker module:make-middleware posts auth-check
```

:::

### `module:make-type <module> [name]`

Generate a types file at `types/<name>.ts` with `Record`, `Result` and `ListResult` interfaces for the module to share.

::: code-group

```bash [npm]
npm run maker module:make-type posts dto
```

```bash [pnpm]
pnpm maker module:make-type posts dto
```

```bash [yarn]
yarn maker module:make-type posts dto
```

```bash [bun]
bun maker module:make-type posts dto
```

:::

### `module:make-job <module> [name]`

Generate a queue job file with the `shouldQueue` pattern.

::: code-group

```bash [npm]
npm run maker module:make-job posts publish
```

```bash [pnpm]
pnpm maker module:make-job posts publish
```

```bash [yarn]
yarn maker module:make-job posts publish
```

```bash [bun]
bun maker module:make-job posts publish
```

:::

### `module:make-console <module> [name]`

Generate a scheduler/console command file with the `defineSchedule` pattern.

::: code-group

```bash [npm]
npm run maker module:make-console posts cleanup
```

```bash [pnpm]
pnpm maker module:make-console posts cleanup
```

```bash [yarn]
yarn maker module:make-console posts cleanup
```

```bash [bun]
bun maker module:make-console posts cleanup
```

:::

### `module:make-test <module> [name]`

Generate a unit test file for a module. If no name given, uses the module name. The test file is created under the module's `__tests__/` directory.

::: code-group

```bash [npm]
npm run maker module:make-test posts
npm run maker module:make-test posts user-test
```

```bash [pnpm]
pnpm maker module:make-test posts
pnpm maker module:make-test posts user-test
```

```bash [yarn]
yarn maker module:make-test posts
yarn maker module:make-test posts user-test
```

```bash [bun]
bun maker module:make-test posts
bun maker module:make-test posts user-test
```

:::

## Delete Commands

### `module:delete <name>`

Soft-delete a module by moving it to `src/storage/trash/modules/<name>-<timestamp>/`. The module can be recovered from trash.

::: code-group

```bash [npm]
npm run maker module:delete posts
npm run maker module:delete posts -- --yes
npm run maker module:delete posts -- --dry-run
```

```bash [pnpm]
pnpm maker module:delete posts
pnpm maker module:delete posts --yes
pnpm maker module:delete posts --dry-run
```

```bash [yarn]
yarn maker module:delete posts
yarn maker module:delete posts --yes
yarn maker module:delete posts --dry-run
```

```bash [bun]
bun maker module:delete posts
bun maker module:delete posts --yes
bun maker module:delete posts --dry-run
```

:::

### `module:delete-notification [name]`

Remove the notification backend module (moves to trash). UI files are user-managed.

::: code-group

```bash [npm]
npm run maker module:delete-notification
npm run maker module:delete-notification -- --yes
npm run maker module:delete-notification -- --dry-run
```

```bash [pnpm]
pnpm maker module:delete-notification
pnpm maker module:delete-notification --yes
pnpm maker module:delete-notification --dry-run
```

```bash [yarn]
yarn maker module:delete-notification
yarn maker module:delete-notification --yes
yarn maker module:delete-notification --dry-run
```

```bash [bun]
bun maker module:delete-notification
bun maker module:delete-notification --yes
bun maker module:delete-notification --dry-run
```

:::

### `module:trash:clean [name]`

Permanently remove entries from module trash. Without a name, cleans all trash. With a name, cleans only matching entries.

::: code-group

```bash [npm]
npm run maker module:trash:clean
npm run maker module:trash:clean posts
npm run maker module:trash:clean -- --yes
npm run maker module:trash:clean -- --dry-run
```

```bash [pnpm]
pnpm maker module:trash:clean
pnpm maker module:trash:clean posts
pnpm maker module:trash:clean --yes
pnpm maker module:trash:clean --dry-run
```

```bash [yarn]
yarn maker module:trash:clean
yarn maker module:trash:clean posts
yarn maker module:trash:clean --yes
yarn maker module:trash:clean --dry-run
```

```bash [bun]
bun maker module:trash:clean
bun maker module:trash:clean posts
bun maker module:trash:clean --yes
bun maker module:trash:clean --dry-run
```

:::

## Utility Commands

### `module:list`

List all discovered modules under `src/modules/`.

::: code-group

```bash [npm]
npm run maker module:list
```

```bash [pnpm]
pnpm maker module:list
```

```bash [yarn]
yarn maker module:list
```

```bash [bun]
bun maker module:list
```

:::

### `module:seed <module>`

Run seeders for a single module.

::: code-group

```bash [npm]
npm run maker module:seed posts
```

```bash [pnpm]
pnpm maker module:seed posts
```

```bash [yarn]
yarn maker module:seed posts
```

```bash [bun]
bun maker module:seed posts
```

:::

### `module:migrate <module>`

Generate a module-only schema, create a migration, and run it. Uses a temporary schema file that includes only the specified module's models.

::: code-group

```bash [npm]
npm run maker module:migrate posts
npm run maker module:migrate posts -- --keep-temp
```

```bash [pnpm]
pnpm maker module:migrate posts
pnpm maker module:migrate posts --keep-temp
```

```bash [yarn]
yarn maker module:migrate posts
yarn maker module:migrate posts --keep-temp
```

```bash [bun]
bun maker module:migrate posts
bun maker module:migrate posts --keep-temp
```

:::

## Panels

Every module command accepts `--path=<panel>` to nest the module under a panel folder. A panel is only a folder separator — the module keeps the same structure and rules, and its routes mount under the panel path:

::: code-group

```bash [npm]
npm run maker module:make post -- --path=admin
npm run maker module:make-controller blog post -- --path=admin
npm run maker module:make-route blog post -- --path=admin
npm run maker module:make-model blog post -- --path=admin
```

```bash [pnpm]
pnpm maker module:make post --path=admin
pnpm maker module:make-controller blog post --path=admin
pnpm maker module:make-route blog post --path=admin
pnpm maker module:make-model blog post --path=admin
```

```bash [yarn]
yarn maker module:make post --path=admin
yarn maker module:make-controller blog post --path=admin
yarn maker module:make-route blog post --path=admin
yarn maker module:make-model blog post --path=admin
```

```bash [bun]
bun maker module:make post --path=admin
bun maker module:make-controller blog post --path=admin
bun maker module:make-route blog post --path=admin
bun maker module:make-model blog post --path=admin
```

:::

| Without `--path`       | With `--path=admin`        |
| ---------------------- | -------------------------- |
| `src/modules/post/`    | `src/modules/admin/post/`  |
| mounted at `/api/post` | mounted at `/api/admin/post` |
| Scalar tag `Post`      | Scalar tag `Admin / Post`  |

Nested panels work too: `--path=admin/reporting` → `src/modules/admin/reporting/post/` → `/api/admin/reporting/post`.

The CLI prints the panel and its API path after scaffolding:

```
Module ready: admin/post
Panel: admin  ->  /api/admin/post
```

To address an existing panel module with any subcommand, pass the same `--path` — e.g. `module:make-controller blog post --path=admin` writes `src/modules/admin/blog/controllers/post.ts`, and `module:delete post --path=admin` moves `src/modules/admin/post/` to trash.

## Removed Commands

### `module:example [name]` (removed in 4.1.0)

The one-shot example module generator was removed. Create a module with `module:make` and add the pieces you need with the component commands above.
