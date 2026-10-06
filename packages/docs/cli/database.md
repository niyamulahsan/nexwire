# Database Commands

Manage your database schema, migrations, seeders, and Drizzle Kit integration. All commands auto-detect your database dialect (SQLite, MySQL, PostgreSQL) from `DATABASE_URL` in `.env`.

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

## Schema & Migrations

### `db:schema`

Generate `src/database/schema.ts` by aggregating all model files from `src/modules/*/database/models/`. This is the single source of truth that Drizzle Kit reads.

Run this after creating or modifying any model file.

::: code-group

```bash [npm]
npm run maker db:schema
```

```bash [pnpm]
pnpm maker db:schema
```

```bash [yarn]
yarn maker db:schema
```

```bash [bun]
bun maker db:schema
```

:::

### `db:generate`

Generate Drizzle Kit migration SQL files under `src/database/migrations/<dialect>/`. Runs `drizzle-kit generate` behind the scenes.

- First migration is named `init`
- Subsequent migrations get timestamp-based names

::: code-group

```bash [npm]
npm run maker db:generate
```

```bash [pnpm]
pnpm maker db:generate
```

```bash [yarn]
yarn maker db:generate
```

```bash [bun]
bun maker db:generate
```

:::

### `db:migrate`

Generate migrations (if needed) then run them against the database. Equivalent to `db:generate` + `db:migrate:run`.

::: code-group

```bash [npm]
npm run maker db:migrate
npm run maker db:migrate -- --seed
```

```bash [pnpm]
pnpm maker db:migrate
pnpm maker db:migrate --seed
```

```bash [yarn]
yarn maker db:migrate
yarn maker db:migrate --seed
```

```bash [bun]
bun maker db:migrate
bun maker db:migrate --seed
```

:::

### `db:migrate:run`

Apply pending migrations only — does not generate new ones. Reads the `meta/_journal.json` to track which migrations have been applied.

::: code-group

```bash [npm]
npm run maker db:migrate:run
```

```bash [pnpm]
pnpm maker db:migrate:run
```

```bash [yarn]
yarn maker db:migrate:run
```

```bash [bun]
bun maker db:migrate:run
```

:::

### `db:fresh`

Drop all tables, regenerate schema, generate migrations, and run them. Useful during early development when the schema changes frequently.

**Aliases:** `db:migrate:fresh`

**Dialect behavior:**

| Dialect    | Reset method                                               |
| ---------- | ---------------------------------------------------------- |
| SQLite     | Delete the `.sqlite` file and recreate                     |
| MySQL      | `DROP DATABASE` + `CREATE DATABASE`                        |
| PostgreSQL | Terminate connections, `DROP DATABASE` + `CREATE DATABASE` |

::: code-group

```bash [npm]
npm run maker db:fresh
npm run maker db:fresh -- --seed
```

```bash [pnpm]
pnpm maker db:fresh
pnpm maker db:fresh --seed
```

```bash [yarn]
yarn maker db:fresh
yarn maker db:fresh --seed
```

```bash [bun]
bun maker db:fresh
bun maker db:fresh --seed
```

:::

### `db:reset`

Drop and recreate the database without running any migrations. Use `db:fresh` if you want migrations afterward.

**Aliases:** `db:migrate:reset`, `db:wipe`

::: code-group

```bash [npm]
npm run maker db:reset
```

```bash [pnpm]
pnpm maker db:reset
```

```bash [yarn]
yarn maker db:reset
```

```bash [bun]
bun maker db:reset
```

:::

### `db:status`

List all migration files with their dialect, showing which have been applied.

::: code-group

```bash [npm]
npm run maker db:status
```

```bash [pnpm]
pnpm maker db:status
```

```bash [yarn]
yarn maker db:status
```

```bash [bun]
bun maker db:status
```

:::

## Push & Check

### `db:push`

Push schema changes directly to the database without generating migration files. Uses `drizzle-kit push`. Useful for rapid prototyping.

> **Note:** `push` does not create migration files. Use `db:generate` for production.

::: code-group

```bash [npm]
npm run maker db:push
```

```bash [pnpm]
pnpm maker db:push
```

```bash [yarn]
yarn maker db:push
```

```bash [bun]
bun maker db:push
```

:::

### `db:check`

Check for differences between your schema and the database. Uses `drizzle-kit check`. Reports any discrepancies without making changes.

::: code-group

```bash [npm]
npm run maker db:check
```

```bash [pnpm]
pnpm maker db:check
```

```bash [yarn]
yarn maker db:check
```

```bash [bun]
bun maker db:check
```

:::

## Seeders

### `db:seed`

Run all registered seeders by executing `src/framework/database/seed.ts`. Seeds are organized per-module under each module's `database/seeders/` directory.

| Flag              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `--module <name>` | Optional module name — run only that module's seeders |

::: code-group

```bash [npm]
npm run maker db:seed
npm run maker db:seed -- --module=posts
```

```bash [pnpm]
pnpm maker db:seed
pnpm maker db:seed --module=posts
```

```bash [yarn]
yarn maker db:seed
yarn maker db:seed --module=posts
```

```bash [bun]
bun maker db:seed
bun maker db:seed --module=posts
```

:::

### `db:module:seed <module>`

Run seeders for a single module only.

::: code-group

```bash [npm]
npm run maker db:module:seed posts
```

```bash [pnpm]
pnpm maker db:module:seed posts
```

```bash [yarn]
yarn maker db:module:seed posts
```

```bash [bun]
bun maker db:module:seed posts
```

:::

## Studio

### `db:studio`

Launch Drizzle Kit Studio — a web-based UI for browsing and editing your database. Opens at `https://local.drizzle.studio`.

::: code-group

```bash [npm]
npm run maker db:studio
npm run maker db:studio -- --quiet
```

```bash [pnpm]
pnpm maker db:studio
pnpm maker db:studio --quiet
```

```bash [yarn]
yarn maker db:studio
yarn maker db:studio --quiet
```

```bash [bun]
bun maker db:studio
bun maker db:studio --quiet
```

:::

## Shorthand

You can also use `db <subcommand>` instead of `db:<subcommand>`:

```bash
npm run maker db schema
npm run maker db migrate -- --seed
npm run maker db fresh -- --seed
npm run maker db seed
```

## Unsupported Commands

Drizzle Kit does not support rollback or refresh operations:

| Attempted             | Why it fails              | Use instead                                 |
| --------------------- | ------------------------- | ------------------------------------------- |
| `db:rollback`         | No down-migration concept | `db:fresh --seed` (local dev) or manual SQL |
| `db:refresh`          | No drop-and-re-run        | `db:fresh --seed`                           |
| `db:migrate:rollback` | Same as `db:rollback`     | `db:fresh --seed`                           |
| `db:migrate:refresh`  | Same as `db:refresh`      | `db:fresh --seed`                           |

## Lifecycle

```
Schema files (*.ts)
    │
    ▼
db:schema ──────────► src/database/schema.ts
    │
    ▼
db:generate ─────────► Migration SQL files
    │
    ▼
db:migrate:run ─────► Applied to database
    │
    ▼
db:seed ────────────► Seed data inserted
```
