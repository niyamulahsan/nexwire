# Module Commands

Generate and manage modules â€” the building blocks of your application. Each module is a self-contained directory under `src/modules/` with its own controllers, routes, models, jobs, and seeders.

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

## Scaffold Commands

### `module:make <name>`

Create a complete module with all default scaffolding.

| Generated  | Path                                                   |
| ---------- | ------------------------------------------------------ |
| Controller | `src/modules/<name>/controllers/<name>.controller.ts`  |
| Schema     | `src/modules/<name>/controllers/<name>.schema.ts`      |
| Route      | `src/modules/<name>/routes/api.ts`                     |
| Model      | `src/modules/<name>/database/models/<name>.ts`         |
| Seeder     | `src/modules/<name>/database/seeders/<name>.seeder.ts` |

```
src/modules/posts/
â”œâ”€â”€ controllers/
â”‚   â”œâ”€â”€ posts.controller.ts
â”‚   â””â”€â”€ posts.schema.ts
â”œâ”€â”€ database/
â”‚   â”œâ”€â”€ models/
â”‚   â”‚   â””â”€â”€ posts.ts
â”‚   â””â”€â”€ seeders/
â”‚       â””â”€â”€ posts.seeder.ts
â””â”€â”€ routes/
    â””â”€â”€ api.ts
```

### `module:make-notification [name]`

Generate a notification backend module with controller, routes, and job. Default name is `notification`.

| File                                     | Purpose                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| `controllers/notification.controller.ts` | 5 handlers: list, unreadCount, markRead, markAllRead, remove |
| `controllers/notification.schema.ts`     | Zod/OpenAPI schemas                                          |
| `routes/api.ts`                          | 5 routes under `authMiddleware`                              |
| `jobs/notification.ts`                   | Queue handler for email delivery                             |

::: tip
UI integration is manual â€” see [Notification Guide](/guide/notification) for Vue copy-paste components and setup instructions.
:::



Generate a one-shot example module demonstrating framework features â€” queue jobs, real-time broadcasting, scheduler cron, and a model with CRUD. Default name is `example`.

```
src/modules/example/
â”œâ”€â”€ controllers/
â”‚   â”œâ”€â”€ example.controller.ts
â”‚   â””â”€â”€ example.schema.ts
â”œâ”€â”€ database/
â”‚   â””â”€â”€ models/
â”‚       â””â”€â”€ example.ts
â”œâ”€â”€ jobs/
â”‚   â””â”€â”€ example.job.ts
â”œâ”€â”€ routes/
â”‚   â””â”€â”€ api.ts
â””â”€â”€ consoles/
    â””â”€â”€ example.command.ts
```

## Component Commands

Add individual components to an existing module. All support `--force` (overwrite) and `--dry-run` (preview).

### `module:make-route <module> [controller]`

Generate or overwrite a route file for an existing module. If no controller name given, uses the latest modified controller in the module.

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

Generate a controller and schema file. If no name given, uses the module name.

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

Generate a seeder file for a model. The seeder is registered in the module's seeder index.

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

### `

### module:make-schema <module> [name]

Generate a schema file.

module:make-job <module> [name]`

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

Generate a unit test file for a module. If no name given, uses the module name. The test file is created under the module's test directory.

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



