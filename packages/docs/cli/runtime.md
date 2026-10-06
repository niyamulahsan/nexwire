# Runtime Commands

Start, serve, and manage your application's runtime processes — API server, queue workers, scheduler, UI, and developer tools.

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

## Development Server

### `dev`

Start the full development stack — API server, UI, queue worker (if Redis enabled), and optional dev tools — all in parallel with a single command.

**What starts:**

| Process        | Started when              | Command                                  |
| -------------- | ------------------------- | ---------------------------------------- |
| API server     | Always                    | `serve --src` (hot-reload via tsx watch) |
| UI             | `UI != "false"`           | Vite dev server on port 5173             |
| Queue worker   | `REDIS != "false"`        | `queue:work --queue=default,mail --src`  |
| Optional tools | `--view` / `--with` flags | MailDev, Redis Commander, Drizzle Studio |

All child processes are tracked. If any required process exits unexpectedly, the entire stack shuts down.

::: code-group

```bash [npm]
npm run maker dev
```

```bash [pnpm]
pnpm maker dev
```

```bash [yarn]
yarn maker dev
```

```bash [bun]
bun maker dev
```

:::

### Additional tools

::: code-group

```bash [npm]
npm run maker dev -- --view=redis,maildev,studio
npm run maker dev -- --with-redis-view --with-maildev --with-db-studio
```

```bash [pnpm]
pnpm maker dev --view=redis,maildev,studio
pnpm maker dev --with-redis-view --with-maildev --with-db-studio
```

```bash [yarn]
yarn maker dev --view=redis,maildev,studio
yarn maker dev --with-redis-view --with-maildev --with-db-studio
```

```bash [bun]
bun maker dev --view=redis,maildev,studio
bun maker dev --with-redis-view --with-maildev --with-db-studio
```

:::

| Tool            | Flag                          | What it provides                                                   |
| --------------- | ----------------------------- | ------------------------------------------------------------------ |
| Redis Commander | `redis` / `--with-redis-view` | Web UI at port 1369 to inspect Redis keys                          |
| MailDev         | `maildev` / `--with-maildev`  | SMTP server at port 1089 + web UI at port 1080 to view sent emails |
| Drizzle Studio  | `studio` / `--with-db-studio` | Web UI at `https://local.drizzle.studio` for database browsing     |

### `ui:dev`

Start only the UI dev server (alias: `admin:dev`). Useful when you want to run the API separately.

::: code-group

```bash [npm]
npm run maker ui:dev
```

```bash [pnpm]
pnpm maker ui:dev
```

```bash [yarn]
yarn maker ui:dev
```

```bash [bun]
bun maker ui:dev
```

:::

## Production Server

### `serve`

Start the HTTP API server.

**Flags:**

| Flag               | Default | Description                                 |
| ------------------ | ------- | ------------------------------------------- |
| `--prod`           | —       | Run compiled `dist/src/framework/server.js` |
| `--runtime <name>` | `node`  | Runtime: `node` or `bun`                    |
| `--watch`          | —       | Watch for file changes (source mode)        |
| `--src`            | —       | Force source mode even if `dist/` exists    |

::: code-group

```bash [npm]
npm run maker serve
npm run maker serve -- --prod
npm run maker serve -- --prod --runtime=node
npm run maker serve -- --runtime=bun
npm run maker serve -- --watch
npm run maker serve -- --src
```

```bash [pnpm]
pnpm maker serve
pnpm maker serve --prod
pnpm maker serve --prod --runtime=node
pnpm maker serve --runtime=bun
pnpm maker serve --watch
pnpm maker serve --src
```

```bash [yarn]
yarn maker serve
yarn maker serve --prod
yarn maker serve --prod --runtime=node
yarn maker serve --runtime=bun
yarn maker serve --watch
yarn maker serve --src
```

```bash [bun]
bun maker serve
bun maker serve --prod
bun maker serve --prod --runtime=node
bun maker serve --runtime=bun
bun maker serve --watch
bun maker serve --src
```

:::

## Queue

### `queue:work`

Start a BullMQ queue worker that processes jobs from named queues.

| Flag               | Default   | Description                                                   |
| ------------------ | --------- | ------------------------------------------------------------- |
| `--queue <names>`  | `default` | Comma-separated queue names (e.g. `default,mail,maintenance`) |
| `--prod`           | —         | Run from compiled `dist/` instead of source                   |
| `--runtime <name>` | `node`    | Runtime: `node` or `bun`                                      |
| `--src`            | —         | Force source mode even if `dist/` exists                      |

::: code-group

```bash [npm]
npm run maker queue:work
npm run maker queue:work -- --queue=mail
npm run maker queue:work -- --queue=default,mail,maintenance
npm run maker queue:work -- --prod
npm run maker queue:work -- --queue=default,mail --prod --runtime=node
```

```bash [pnpm]
pnpm maker queue:work
pnpm maker queue:work --queue=mail
pnpm maker queue:work --queue=default,mail,maintenance
pnpm maker queue:work --prod
pnpm maker queue:work --queue=default,mail --prod --runtime=node
```

```bash [yarn]
yarn maker queue:work
yarn maker queue:work --queue=mail
yarn maker queue:work --queue=default,mail,maintenance
yarn maker queue:work --prod
yarn maker queue:work --queue=default,mail --prod --runtime=node
```

```bash [bun]
bun maker queue:work
bun maker queue:work --queue=mail
bun maker queue:work --queue=default,mail,maintenance
bun maker queue:work --prod
bun maker queue:work --queue=default,mail --prod --runtime=node
```

:::

### `queue:clear`

Delete all queue-related Redis keys. Useful for resetting stale job state during development.

::: code-group

```bash [npm]
npm run maker queue:clear
```

```bash [pnpm]
pnpm maker queue:clear
```

```bash [yarn]
yarn maker queue:clear
```

```bash [bun]
bun maker queue:clear
```

:::

## Scheduler

### `schedule:work`

Start the cron scheduler worker. Executes scheduled tasks defined with `defineSchedule()` on their configured intervals.

::: code-group

```bash [npm]
npm run maker schedule:work
npm run maker schedule:work -- --prod
```

```bash [pnpm]
pnpm maker schedule:work
pnpm maker schedule:work --prod
```

```bash [yarn]
yarn maker schedule:work
yarn maker schedule:work --prod
```

```bash [bun]
bun maker schedule:work
bun maker schedule:work --prod
```

:::

## Testing

### `test`

Run Vitest backend tests once.

::: code-group

```bash [npm]
npm run maker test
npm run maker test -- -- --filter=posts
```

```bash [pnpm]
pnpm maker test
pnpm maker test --filter=posts
```

```bash [yarn]
yarn maker test
yarn maker test --filter=posts
```

```bash [bun]
bun maker test
bun maker test --filter=posts
```

:::

### `test:watch`

Run Vitest backend tests in watch mode — re-runs on file changes.

::: code-group

```bash [npm]
npm run maker test:watch
```

```bash [pnpm]
pnpm maker test:watch
```

```bash [yarn]
yarn maker test:watch
```

```bash [bun]
bun maker test:watch
```

:::

### `test:coverage`

Run Vitest backend tests with code coverage reporting.

::: code-group

```bash [npm]
npm run maker test:coverage
```

```bash [pnpm]
pnpm maker test:coverage
```

```bash [yarn]
yarn maker test:coverage
```

```bash [bun]
bun maker test:coverage
```

:::

### `test:ui`

Run Vitest backend tests in the visual UI mode.

::: code-group

```bash [npm]
npm run maker test:ui
```

```bash [pnpm]
pnpm maker test:ui
```

```bash [yarn]
yarn maker test:ui
```

```bash [bun]
bun maker test:ui
```

:::

## Dev Tools

### `maildev:view`

Start MailDev — a combined SMTP server and web email viewer. Catches all outgoing emails during development.

| Service | Port |
| ------- | ---- |
| SMTP    | 1089 |
| Web UI  | 1080 |

::: code-group

```bash [npm]
npm run maker maildev:view
```

```bash [pnpm]
pnpm maker maildev:view
```

```bash [yarn]
yarn maker maildev:view
```

```bash [bun]
bun maker maildev:view
```

:::

### `redis:view`

Start Redis Commander — a web UI to browse and manage Redis keys.

| Service | Port |
| ------- | ---- |
| Web UI  | 1369 |

If Redis is not reachable, the view does not fail silently. `redis:view` first
probes the configured `REDIS_URL` and, when nothing answers (or `REDIS=false` in
`.env`), it serves a **Redis Commander Unavailable** page on port 1369 naming
the Redis URL it tried, instead of leaving the browser to report "unable to
connect".

This page is specific to Redis Commander. It is **not** the queue dashboard:
queue and job state live on the app's own bull-board route at `/queues`, which
shows its own *Queue Dashboard Unavailable* page when Redis is down. The two
tools are separate — Redis Commander browses raw Redis keys, the bull-board
shows BullMQ queue state.

::: code-group

```bash [npm]
npm run maker redis:view
```

```bash [pnpm]
pnpm maker redis:view
```

```bash [yarn]
yarn maker redis:view
```

```bash [bun]
bun maker redis:view
```

:::

### `vite:cache:clear`

Clear Vite caches. Removes `.vite` directories from `node_modules`, `src/resources`, and other locations.

::: code-group

```bash [npm]
npm run maker vite:cache:clear
```

```bash [pnpm]
pnpm maker vite:cache:clear
```

```bash [yarn]
yarn maker vite:cache:clear
```

```bash [bun]
bun maker vite:cache:clear
```

:::

## Custom Commands

Your project can add its own maker commands. The file you own is `maker/commands.mjs` in the project root.

It is deliberately outside `src/`. Anything under `src/framework/` is copied into the published package, so an edit there is lost on the next framework update, and `src/modules/` is swept by the route, job and seeder globs.

### `maker:init`

Creates `maker/commands.mjs` with a working example. It will not overwrite an existing file unless you pass `--force`.

::: code-group

```bash [npm]
npm run maker maker:init
```

```bash [pnpm]
pnpm maker maker:init
```

```bash [yarn]
yarn maker maker:init
```

```bash [bun]
bun maker maker:init
```

:::

### Writing them

`program` is the same [commander](https://github.com/tj/commander.js) object the built-in commands are built with, so `.command()`, `.description()`, `.option()` and `.action()` behave exactly as they do everywhere else in the maker CLI.

```js
// maker/commands.mjs
import { sendInvoice } from "../src/invoices/send.js";

export default function register(program) {
  program
    .command("invoice:send <customer>")
    .description("Send an invoice to a customer")
    .option("--dry-run", "Print what would be sent")
    .action(async (customer, options) => {
      await sendInvoice(customer, { dryRun: options.dryRun });
    });
}
```

```bash
maker invoice:send acme --dry-run
maker --help          # your commands appear alongside the built-ins
```

Export a `default` function, or a named `register` export — either is accepted.

### Three things that will bite you

**Absent is silent.** If the file does not exist, nothing happens and nothing is printed. That is the common case, so it has to be free.

**Broken is loud.** If the file exists but cannot be parsed, throws while loading, or exports the wrong shape, `maker` stops with an error naming `maker/commands.mjs` and exits non-zero. It is never swallowed — a developer's commands silently not existing is far worse than a message. Every failure names the file:

```text
Could not load maker/commands.mjs: Unexpected end of input
maker/commands.mjs must export a default function (program, args) => void. Found: undefined.
```

::: warning A broken file blocks every maker command
This includes the framework's own. Until the file parses, `module:make` and the rest are unavailable too — the CLI cannot know which of your commands were supposed to work.

To get out, fix the file, or delete it. Deleting leaves nothing behind: nothing caches a registration and no framework update refers to it, so `maker` returns immediately to exactly the state it was in before `maker maker:init`.
:::

**Framework names win.** Commander refuses to register a command whose name is already taken, so a project cannot shadow a built-in it did not write. The error names both the file and the name, so rename yours:

```text
Could not register commands from maker/commands.mjs: cannot add command
'module:list' as already have command 'module:list'
```

::: warning Stubs are not overridable
A custom command does not get a custom stub. `module:make-*` reads from `src/framework/maker-cli/stubs/`, which is framework-owned and replaced on every update. If you need your own template, write the file yourself from your command — that is the honest trade, and it keeps the generated file under your control.
:::

## Finding a command

`maker --help` shows the nexwire wordmark, then groups the commands by what you are trying to do, so you can answer a question instead of reading a flat list of every name.

::: details When you will not see the wordmark
The wordmark is decoration, so it stays out of the way rather than insisting on itself:

- **A terminal narrower than 41 columns** gets plain `nexwire maker` text instead. Art that overflows wraps into an unreadable mess.
- **Piped or redirected output** gets plain text. `maker --help > help.txt` produces a file a human can read, not a file that opens with ASCII art.
- **Per-command help** gets no wordmark at all. `maker module:make --help` is for checking a flag, not for branding.

```text
Getting started
  dev                Start API + Vue 3 UI plus optional workers/tools
  serve              Start HTTP server (dist first if built, else src)

Generators - global
  middleware:make    Generate a middleware file in src/middlewares

Generators - modules
  module:make        Create one or more modules with facade, schema, service...
  module:make-model  Generate a model file for an existing module

Modules - manage
  module:list        List all discovered modules
  module:delete      Move a module directory to storage trash (soft delete)

Database
  db:migrate         Generate then run Drizzle migrations
```

The full set of sections is **Getting started**, **Generators - global**, **Generators - modules**, **Modules - manage**, **Database**, **Queue and scheduler**, **Deploy**, **Testing**, and **Your commands**.

::: tip Generators - global is not the same as Generators - modules
`middleware:make` writes to `src/middlewares` and applies to the whole app. `module:make-middleware` writes inside a single module and applies only to it. They are near-identical names doing different things, so they are deliberately listed in different sections.
:::

The listing shows command names and descriptions only. For the options and arguments of one command:

::: code-group

```bash [npm]
npm run maker <command> --help
```

```bash [pnpm]
pnpm maker <command> --help
```

```bash [yarn]
yarn maker <command> --help
```

```bash [bun]
bun maker <command> --help
```

:::

`maker help <command>` does the same thing and still works.

::: details Why your own commands appear under "Your commands"
Commands you register in `maker/commands.mjs` are listed beside `maker:init`, not mixed in with the built-ins, so it is obvious which commands you added.
:::

## Summary

| Command            | Development                           | Production             |
| ------------------ | ------------------------------------- | ---------------------- |
| `dev`              | Full stack (API + UI + queue + tools) | —                      |
| `serve`            | API with watch                        | API without watch      |
| `queue:work`       | Queue worker from source              | Queue worker from dist |
| `schedule:work`    | Scheduler from source                 | Scheduler from dist    |
| `ui:dev`           | Vite dev server                       | —                      |
| `test`             | Run tests once                        | —                      |
| `test:watch`       | Run tests in watch mode               | —                      |
| `test:coverage`    | Run tests with coverage               | —                      |
| `test:ui`          | Run tests in UI mode                  | —                      |
| `queue:clear`      | Development cleanup                   | —                      |
| `maildev:view`     | Email testing                         | —                      |
| `redis:view`       | Redis inspection                      | —                      |
| `vite:cache:clear` | Cache cleanup                         | —                      |
| `maker:init`       | Create `maker/commands.mjs`           | —                      |
