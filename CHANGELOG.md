# Changelog

## [4.0.0] — 2026-09-28

> Successor to `create-nexgen@3.2.1`. The old package **stays published and must be deprecated — do not delete it**, because existing installs would hard-fail. Deprecate it with:
> `npm deprecate create-nexgen "Renamed to nexwire. Use: npm create nexwire@latest my-app"`

### Breaking

- **Project renamed to `nexwire`** — the unscoped npm name `nexgen` is owned by an unrelated package (`samwalshnz`, "Get the current song on a radio station", 2022), which made the framework effectively undiscoverable: searching "nexgen" surfaced that package, and `npx nexgen@latest` executed *its* binary rather than the scaffolder. The new name is uncontested — `nexwire`, `create-nexwire` and the `@nexwire` scope all return 0 registry hits. 697 brand references across 206 files: root package `nexwire-monorepo`, scaffolder `create-nexwire`, directory `packages/create-nexgen/` → `packages/create-nexwire/`, templates `nexwire-express` / `nexwire-hono`, and the `NexgenRouter` type → `NexwireRouter`. Install command is now `npm create nexwire@latest my-app`; the published bin also exposes the bare `nexwire` command.

- **`NEXGEN_*` environment variables renamed to `NEXWIRE_*`** — 29 tokens across templates, scaffolder, `.env` files and docs (e.g. `NEXGEN_FRONTEND_URL` → `NEXWIRE_FRONTEND_URL`). **This breaks any existing deployment** — update your `.env` and deploy environment. Projects scaffolded from `create-nexgen@3.2.1` still use the `NEXGEN_` prefix and are unaffected, since the framework is copied into the project at scaffold time rather than installed as a dependency.

- **GitHub URLs updated to `/nexwire`** (the repository rename itself is still pending and must be performed for these links to resolve) — all `github.com/niyamulahsan/nexgen` URLs now point to `/nexwire`.

### Fixed

- **Scaffolded README advertised the wrong engine** — the Features table said "Hono HTTP server", so a project scaffolded with `--engine=express` shipped a README claiming Hono. Now "Hono/Express HTTP server" across all six copies (root `README.md`, `template/{express,hono}/README.md`, `packages/create-nexwire/README.md`, `packages/create-nexwire/{express,hono}/README.md`). The four scaffolded copies are byte-identical and the table column alignment is preserved.

- **`npm run maker db:migrate --seed` silently dropped the `--seed` flag** -- npm consumes `--seed` as its own unknown CLI config instead of forwarding it to the script, so the command ran as a plain `db:migrate` and no seeders executed. The npm warning `Unknown cli config "--seed"` was the only clue. npm requires a `--` separator: `npm run maker db:migrate -- --seed` (bun's `bun maker db:migrate --seed` works unchanged). Corrected in the four scaffolded `README.md` copies (byte-identical), root `README.md`, `packages/create-nexwire/README.md`, `packages/docs/guide/database.md` and `packages/docs/cli/database.md`. The maker CLI no longer prints the bun-only form: the `--seed` option descriptions and the two `db:fresh` recovery messages now show the npm form alongside the bun form.

- **`db:migrate --seed` crashed on any freshly generated module** -- `module:make` writes a fully commented-out seeder stub (intentionally, so it compiles and inserts no fake rows), but `seed.ts` threw `Seeder file ... has no default export function` on any seeder without a default export. So the documented quick-start order -- generate a module, then `db:migrate --seed` -- always aborted with exit code 1. `seed.ts` now skips seeder files containing no `export` statements and reports `Skipped unfilled seeder <file> (no exports yet)`; a seeder that *does* export something but lacks a default function still throws, so genuine mistakes remain loud. Byte-identical across both engines (sha256 34a7f82b1ff2a0669d4332bc6e8a8fcdb210843cae1813f34eca30806c3a4dab).

- **Redis Commander view left port 1369 dead when Redis was unavailable** -- `npm run maker dev -- --with-redis-view` (or `redis:view`) with `REDIS=false` in `.env` skipped launching the commander entirely, so the documented URL `http://localhost:1369` was a closed port and the browser only said "unable to connect". With `REDIS=true` but no Redis actually listening, the commander started and rendered its own raw connection error instead of the framework's diagnostic. `redis:view` now probes `REDIS_URL` with a short TCP connect and, when nothing answers or `REDIS` is disabled, serves a **Redis Commander Unavailable** page (naming the Redis URL) that identifies Redis Commander and the Redis key browser and points at `/queues` for BullMQ state -- deliberately *not* the `framework/queue/ui.ts` "Queue Dashboard Unavailable" page, which describes the bull-board route and would mislabel a key browser as a queue dashboard; otherwise it launches Redis Commander exactly as before. The dev-stack gate no longer suppresses the view when `--with-redis-view` was explicitly requested with Redis disabled, so the advertised port stays live. The CLI runtime (`maker-cli/runtime/core.mjs`) is plain `.mjs` with no `tsconfig allowJs`, so the page markup is built locally rather than imported from `ui.ts`; the new functions are byte-identical across both engines (sha256 664f4a072755c0200aea2f72502b18af1077f4de4d57e9638bba7aedfd4e4e8e).

- **Stale runtime log files shipped inside the npm tarball** -- `template/{express,hono}/src/storage/logs/app.log` and `fatal.log` (up to 41 KB, 1118 lines) were untracked dev artifacts that `npm pack` still included, leaking local stack traces and absolute paths into every generated project. Present in published `create-nexgen@3.2.1` and carried into the 4.0.0 candidate. Deleting them was not enough: they are regenerated every time the app runs from `template/hono` or `template/express` (your own local run recreates them), and because `package.json` declares a `files: ["src","hono","express"]` whitelist, a root `.npmignore` is never consulted -- so npm packed them anyway. `scripts/sync-template.mjs` (the prepublish hook) now excludes `*.log` from the engine copies, which is the only place the rule is actually enforced. Verified by re-packing with the log files still present on disk: 490 -> 486 files, zero `.log` in the payload. `.gitkeep` still ships, so the runtime log directory exists.

- **First run could not survive a SQLite `DATABASE_URL`** -- the three core auth models (`modules/auth/database/models/{role,user,notifications}.ts`) were hardcoded to `drizzle-orm/mysql-core` (`mysqlTable`, `int().autoincrement()`, `onUpdateNow()`), so the documented "SQLite, MySQL, or PostgreSQL. Auto-detected from `DATABASE_URL`" was false for a fresh project: pointing `DATABASE_URL` at SQLite made `db:migrate` generate **zero tables** (and report success), after which every query failed -- login and register were broken out of the box, and SQLite is exactly what a first-time developer is most likely to choose because it needs no server. The three model files are now native `drizzle-orm/sqlite-core` (`integer("id").primaryKey({ autoIncrement: true })`, `text`, `integer({ mode: "timestamp" })`, `integer({ mode: "boolean" })`); MySQL's `onUpdateNow()` was dropped because SQLite has no equivalent, so the core schema is SQLite-only by default. In the same change the framework now ships the migration and its data: `src/database/migrations/sqlite/` (generated `0000_init.sql` + meta) and a **pre-migrated, pre-seeded** `src/storage/database/nexwire.sqlite` (roles `admin`/`user`, users `admin@example.com` / `user1@example.com`, bcrypt-hashed `Password@123`) so a fresh `create-nexwire` project works with zero setup -- `cp .env.example .env`, then `npm run dev` and the seeded admin can log in immediately; the shipped migration makes subsequent `db:migrate` a no-op and future schema changes generate `0001_*`. Template `.env` / `.env.example` default changed from `mysql://...` to `sqlite:./src/storage/database/nexwire.sqlite`. The three model files and the SQLite database file are byte-identical across **express** and **hono** (DB sha256 afce2f88755d40650bdcfbd6b55d2ca87df46561a6926c5eb40300245697c61b).

- **Register / notify crashed with 500 on a SQLite database** -- `auth.controller.ts` (`register`) and `framework/notification/index.ts` (`notify`) resolved the inserted row id from `insertResult.insertId`, a mysql2-only field. libsql/sqlite awaits return `lastInsertRowid` instead, so on the new SQLite default every registration inserted the row (making the retry return 422 "Email already exists") then threw `Failed to resolve inserted user id` before issuing tokens. Both helpers now fall back through `[0]?.insertId ?? insertId ?? lastInsertRowid`, working on MySQL and SQLite. The models layer is byte-identical across engines, but `auth.controller.ts` is engine-native by design (Hono `c.req.valid`/`c.json` vs Express `req.body`/`res.status().json()`), so the fix was applied to the Hono handler and the Express handler separately; the Express handler's original `express` idiom is preserved. Byte-identical across **express** and **hono** for the shared `framework/notification/index.ts` (sha256 bb5e35c9b48f7caa506bd432fd5c39dbdaa488a5658744145eb44ae7943ca279).

## [3.2.1] — 2026-09-24

### Fixed

- **Scaffolder maker-cli runtime injects the dev UI origin into the spawned API** -- `create-nexgen`'s maker-cli runtime (`express`/`hono` `framework/maker-cli/runtime/core.mjs` and `core.mts`, line 214) sets `NEXGEN_FRONTEND_URL: "http://localhost:5173"` on the API child process it spawns when the UI is enabled but the built SPA is absent (Vite dev server still running) -- this is the dev-without-build branch the URL resolver consumes. Byte-identical across both engines; shipped via `create-nexgen@latest` / `nexgen@latest`.

- **`useGumForm` dropped the Axios response from the `onSuccess` callback** — `form.post/put/patch/delete` (`submit()`) called `onSuccess` with no argument, so the callback's `e` was `undefined` (no `e.response`, no `e.data`). The `visit()` path passed `response!` correctly; now `submit()` does too — `onSuccess` in **both** paths receives the full **AxiosResponse** (`e.data` / `e.status` / `e.headers`). Arrays (`onStart`, `onSuccess`) no longer trigger the "Expected 0 arguments, but got 1" TS error. **`FormSubmitOptions` now mirrors `GumVisitOptions`** with the full hook surface — `onBefore`, `onStart`, `onProgress(event)`, `onSuccess(response)`, `onError`, `onFinish`. Fixed a stray `await` in the non-async `onUploadProgress` handler (`onProgress?.(event)` is called synchronously, matching `visit()`). Byte-identical across **express** and **hono** engines.

- **Dev reset/verify links pointed at the API origin instead of the Vite dev server** — `urls.url()` in dev with UI enabled but **no UI build yet** (Vite dev server still running) resolved to `APP_URL` (port 3000) instead of the SPA dev origin (port 5173). The resolver now consumes the `NEXGEN_FRONTEND_URL` that maker-cli injects when the built SPA is absent, so reset/verify email links point at the **Vite dev server** (e.g., `http://localhost:5173/reset-password`) in dev-without-build, and at the **app origin** (single port, e.g., `http://localhost:3000/reset-password`) when the framework serves the built SPA — matching browser behavior in production and dev-with-build. Byte-identical across **express** and **hono** engines.

- **`forgetPassword.vue` `onSuccess` now consumes the submitted response** — the callback takes the AxiosResponse (`res`) and displays `res.data.message` from the API instead of a hardcoded "reset link has been sent" text, so the UI reflects the server's actual reply. Byte-identical across **express** and **hono** engines.

- **`resetPassword.vue` `onSuccess` now consumes the submitted response** — the callback takes the AxiosResponse (`res`) and displays `res.data.message` from the API before redirecting to login. Byte-identical across **express** and **hono** engines.

- **`/api-docs` served no favicon on the API origin** — the Scalar docs page ships without a `<link rel="icon">`, so browsers requested `/favicon.ico` from the API server. The **express** engine had no `/favicon.ico` route (404, empty tab icon) and **hono** returned Stoker's rocket-emoji SVG instead of the real icon. Both engines now serve `src/resources/src/assets/images/favicon/favicon.ico` at `/favicon.ico` (`image/x-icon`), matching the SPA favicon; the route is configured from `src/config/openapi.ts` (`scalar.favicon`) and served by `configureOpenApi` on `OPEN_API=true`, so `app.ts` stays untouched; hono's `serveEmojiFavicon` middleware was removed. Byte-identical across **express** and **hono** engines.

- **`src/config/security.ts` exported no `SecurityConfig` type** — `config/index.ts` imported `type SecurityConfig` from `./security.js`, but the template file never exported it (TS2724 on the scaffolded app). Added `export type SecurityConfig = typeof securityConfig;` and fixed a stray `data: data: blob:` duplicated source in the dev CSP `img-src` on the express template. Both templates were also re-synced into `packages/create-nexgen` (which still had the pre-CSP skeleton), so all four copies are byte-identical. Byte-identical across **express** and **hono** engines.

- **Guide intro claimed cache "falls back to the database" when Redis is down** — it does not: the cache is Redis-only. When Redis is unavailable, `cache.get` returns `null`, `put`/`forget` become no-ops, and `remember` recomputes the fresh value on every call. Corrected `guide/introduction.md` to say caching disables itself gracefully instead of suggesting a database cache layer.

- **Guide intro auth examples used the wrong token expiries** — the `jwt.generateToken` snippets passed `3600` for access and `604800` (7 days) for refresh, contradicting the actual config (`900` = 15 min access, `3600` = 1 hour refresh, `2592000` = 30 days "remember me"). Fixed the examples to use the defaults and show the remember-me tier. The expiry logic in `auth.helpers.ts`/`jwt.ts`/`cookie.ts` was verified correct and engine-consistent.

- **Guide intro "Self Deploy to VPS" showed only npm commands** — converted both deploy command blocks (init/remote and promote/import) into `::: code-group` tabs for **npm**, **pnpm**, **yarn**, and **bun**, matching the other guides. `--file=` flag syntax per package manager (`npm run maker` uses `-- --file=…`; direct `maker` calls use `--file=…`).

### Changed

- **`homepage` now points at the GitHub Pages docs instead of a dead domain** — `create-nexwire` declared `"homepage": "https://nexwire.dev"`, a domain the maintainer does not own. npm renders `homepage` as the **Website** link in the package page sidebar, so it shipped a link that goes nowhere (the same defect is visible on the already-published `create-nexgen@3.2.1`, whose `homepage` is `https://nexgen.dev`; a published version's manifest is immutable and 3.2.1 is past npm's 72-hour unpublish window, so it can only be steered with `npm deprecate`, never corrected). `homepage` is repointed to `https://niyamulahsan.github.io/nexwire` — the VitePress docs in `packages/docs`, deployed to GitHub Pages by `.github/workflows/deploy-docs.yml` on every push to `main` that touches `packages/docs/**`. Note the URL only resolves once the `nexwire` repository is public **and** that workflow has run on `main`; before that the path 404s. The two showcase READMEs (root `README.md` and `packages/create-nexwire/README.md`, the GitHub landing page and the npm package page) carried the same dead domain in two more places: the centred logo `<a href="https://nexwire.dev">` now links to the GitHub repo, and the docs badge label / footer text no longer advertise `nexwire.dev` as if it were a live site. The scaffolded project READMEs under `template/{hono,express}` are intentionally left at their previous wording, since they are a per-project starting point rather than a showcase surface; they remain byte-identical across **express** and **hono** (4 copies, same sha256).
- **The two showcase READMEs now open with the value proposition, not an ingredient list** — the previous opening read "a batteries-included TypeScript framework that combines modular backends (Hono, Express) with Drizzle ORM, BullMQ, Socket.IO, Redis, and a Vue 3 SPA frontend", which restated the dependency list and answered nothing about what it saves you; a reader's takeaway was "Hono + Drizzle + BullMQ + Socket.IO + Vue, which I can install myself". The tagline is now a claim ("Stop wiring the stack together. Ship the app."), followed by the problem (the same ten capabilities are a week of glue code whose failures are silent — a job that never runs, a socket that never joins a room), then five concrete differentiators: runnable the second it is created (pre-migrated, pre-seeded SQLite, credentials in the text), nothing to register (`maker module:make blog` plus auto-discovery), one import per subsystem (`@/framework/facade.js`, Redis-free in-memory fallback), optional infrastructure (Redis/mail/S3 circuit breakers with real fallbacks), and one-command VPS deploy over SSH. Quick Start was made consistent with the claim it now makes: `npm run maker db:migrate -- --seed` is dropped from both the Hono and Express blocks (the shipped SQLite database is already migrated and seeded, and both seeders are idempotent — they `findFirst` before inserting) and replaced by a note saying the step is only needed after pointing `DATABASE_URL` at MySQL/PostgreSQL. The `Features` table's database row was corrected at the same time: it claimed "SQLite, MySQL, or PostgreSQL. Auto-detected from `DATABASE_URL`", which no longer describes the shipped core tables (see the SQLite bullet above — the auth/notifications models are now `sqlite-core`); it now reads "SQLite by default, shipped pre-migrated and seeded; MySQL/PostgreSQL also supported, dialect auto-detected". Scope is deliberately limited to the GitHub landing page and the npm package page; the scaffolded READMEs are untouched and stay byte-identical across **express** and **hono**.
- **URL origin resolution is now three-knob and byte-identical across engines** — the origin decision in `framework/support/url.ts` (both engines) is: `frontendUrl` (explicit SPA origin — wins) → `uiEnabled` + built SPA (`hasUiBuild()`) (framework serves it — same/`APP_URL` origin) → `uiEnabled` + no build (dev Vite dev server still running — `process.env.NEXGEN_FRONTEND_URL`, injected by maker-cli, falls back to `APP_URL`) → API-only (`APP_URL`). Comment docs updated to document all three branches.

## [3.2.0] — 2026-09-22

### Added

- **`express` engine** — `create-nexgen` can now scaffold a project on **Express** instead of only Hono. Pick the engine at scaffold time with `--engine=express` (Hono stays the default; pass `--engine=hono` explicitly).

### Changed

- **Both engines ship the same facade surface** — the identical set of app-facing verbs (`storage`, `cache`, `db`/`database` + `paginate*`, `command`/`dispatchCommand`, `dispatchEvent`, `shouldQueue`/`queue`, `defineSchedule`, `session`, `notify`, `broadcast`, plus support helpers), each **implemented natively** in its own engine's idiom. Hono's facade relies on `@hono/zod-openapi` (`createRoute`, `group`, `createRouter`); Express's uses its native router conventions. The files are **not byte-identical by design** — what's identical is the _surface_ (same verbs, same signatures). Switching engines requires **no module, facade, or route changes** (the facade surface is the contract, not the implementation bytes).
- **Orchestration endpoints identical** — `/ready`, `/live`, `/metrics`, and `/health` are auto-wired by both engines' HTTP layer (`http/app.ts`) with byte-identical K8s probe semantics.
- **App settings identical** — security, validation, rate limiting, circuit breaker, and metrics counters are config-driven app settings in both engines, wired by the framework at boot, and never part of the facade.

### Security

- **Security disclosure added to both READMEs** — a `## Security Vulnerabilities` section asks researchers to email the maintainer directly rather than opening a public issue, matching the Laravel-style coordinated-disclosure convention.

---

## [3.1.0] — 2026-09-09

### Added

- **API docs split into per-function pages** — the deskapp-style API reference now has one page for every facade export (32 functions) with a Function | Purpose | Guide overview table, replacing the bundled pages (`http`, `events`, `queue`, `paginate`, `support`, `realtime`→`broadcast`, `scheduler`→`defineSchedule`).
- **Documentation site header** — deskapp-style top nav (`Home`, `Quick Start`, `Guide`, `API`, `CLI`, `Deploy`) with inline SVG icons on every nav and sidebar entry.

### Changed

- **`FRONTEND` env renamed to `UI`** — `frontendEnabled` config key renamed to `uiEnabled` (`template/src/config/app.ts`). No change in behavior; the old `FRONTEND` value is no longer read.
- **Documentation site header** — deskapp-style top nav with inline SVG icons on every nav and sidebar entry.
- **maker-cli restructured** — flattened `src/levels/` layout into `db/`, `deploy/`, `module/`, `runtime/`, `utils/` directories with `index.mjs` at the root. Command surface unchanged (52 commands).

### Fixed

- **`db:module:seed <module>`** — seeds now target the given module argument (`secondArg || firstArg`) instead of the first argument.
- **`deploy:workflow:remote --dry-run`** — dry-run no longer proceeds with the remote workflow half-run.
- **`deploy:db:import:remote --dry-run`** — removed dry-run guard so remote DB import correctly skips execution.
- **`--force` / `--dry-run` on module make commands** — flag parsing refactored across all 7 module make commands (`rawArgs.slice(name ? 3 : 2)`).
- **`SOCKET` env in deploy generation** — deploy env templates fall back to `"false"` when `SOCKET` is not set.

### Documentation

- **sarra removed from API docs** — project-specific examples replaced with generic framework guidance.

---

## [3.0.8] — 2026-08-21

### Added

- **`broadcast` exported from facade** — `broadcast()` can now be imported directly from `@/framework/facade.js` for direct Socket.IO emission without `dispatchEvent()`.
- **OpenAPI config file** (`src/config/openapi.ts`) — new editable config for Scalar theme/layout/docsPath/specUrl/title/version/description.

### Changed

- **`openapi.ts` reads from config** — Scalar and OpenAPI settings now come from `src/config/openapi.ts` instead of being hardcoded.
- **`config/index.ts`** — `openApiConfig` import/export added; `config.openAggregated` includes OpenAPI settings.

### Documentation

- **24 discrepancies fixed** across 16 docs files — wrong imports, wrong defaults, fake env vars, missing options, syntax errors.
- **Realtime docs** — added `broadcast()` direct usage alongside `dispatchEvent()`.
- **Scheduler docs** — added `queue`, `job`, `data`, `immediately` options.
- **New: `guide/openapi.md`** — full OpenAPI setup page (Scalar, metadata, auth, custom theme).
- **API reference "Real world" sections** — authentic examples from the sarra app (auth router, event/queue flows, pagination, storage exports, cookie/jwt/password) added across the API pages.

---

## [3.0.7] — 2026-08-21

### Fixed

- **`--with` flag parsing** — `parseWithOptions` now splits on `/[,\s]+/` so commas and spaces both work, fixing yarn's `--with=redis,maildev,studio` being treated as a single argument.
- **`@hono/zod-openapi` pinned to `~1.5.3`** — `^1.5.2` resolved to 1.6.1 which pulls `@asteasolutions/zod-to-openapi@^9`, breaking `stoker`'s peer dependency on `^8`. Tilde keeps it on 1.5.x.
- **`redis-commander` bumped to `^0.9.0`** — old `^0.4.5` uses `express@3` + `ejs@0.8` which crash with pnpm's newer EJS resolution. `0.9.0` uses `express@4` + `ejs@3`.

### Documentation

- **Quick Start — Package Manager Setup** — new section explaining extra files needed for pnpm (`pnpm-workspace.yaml` with `allowBuilds`) and yarn (`.yarnrc.yml` with `nodeLinker: node-modules` + `dependenciesMeta` in `package.json`).

---

## [3.0.3] — 2026-08-20

### Fixed

- **create-nexgen yarn PnP crash** — scaffolder always downloads the tarball from the npm registry instead of using a local copy, fixing `cpSync` ENOENT errors under Yarn PnP (zip-mounted `node_modules`).
- **create-nexgen leaked `index.js`** — tar extraction now only includes `package/template/*` paths, preventing the CLI source file from appearing in the scaffolded project.
- **create-nexgen peerDependencies synced** — replaced Winston with Pino, bumped `@bull-board/*` to ^8, `nodemailer` to ^9, `redis-commander` to ^0.4, added `@libsql/client`, `@socket.io/bun-engine`, `bullmq-durable`, `croner`, `postgres`; engines updated to `node >=24`, `bun >=1.3.0`, `pnpm >=10`, `yarn >=4`.
- **create-nexgen template dependencies synced** — root `template/package.json` updated to match all framework dependencies.

---

## [3.0.0] — 2026-08-19

### Overview

Unified environment and configuration handling across backend and frontend, added runtime feature toggles (`OPEN_API`, `REDIS`, `FRONTEND`, `SOCKET`) to the Zod schema, consolidated deploy env templates, switched logger from Winston to Pino, added keyboard shortcuts to Dialog, rewrote the entire documentation site with VitePress, and professionalized the GitHub/npm READMEs.

### Features

#### Environment & Config

- **`REDIS`, `OPEN_API`, `FRONTEND`, `SOCKET` in Zod schema** — all four feature toggles now live in `env.ts` with boolean transforms (`!== "false" && !== "0"`), making them the single source of truth. Config files (`app.ts`, `redis.ts`, `realtime.ts`) read from the schema instead of hardcoding.
- **`SOCKET` env toggle** — `config/realtime.ts` reads `env.SOCKET` instead of hardcoding `enabled: true`. The ViteFrontend config also reads `process.env.SOCKET` to control the Pulse client build.
- **`queueUiAllowedEmails` moved** — moved from `redis.ts` to `queue.ts` as `allowedEmails: ""` since it's queue-specific.

#### Deploy

- **Deploy env templates rewritten** — all three stubs (`mysql.server.stub`, `postgres.server.stub`, `sqlite.stub`) now include `OPEN_API`, `SOCKET`, `FRONTEND`, `REDIS`, `REDIS_PREFIX`, `FRONTEND_URL`, `JWT_*`, `COOKIE_SECRET`, `STORAGE_*`, `MAIL_*` with proper comments distinguishing config-file settings from env-var secrets.
- **Deploy core.mjs** — `OPEN_API` and `SOCKET` values now read from the root `.env` and injected into generated templates.
- **`deploy:init` auto-creates `.env`** — workflow copies `.env.example` → `.env` automatically; users only edit `.example` files.
- **`deploy:workflow` env sync** — `ensureEnvFile()` ensures both `deploy/.env` and `deploy/server/.env` exist before starting containers.

#### CLI

- **`module:make-test` added** — new command for generating test scaffolding for modules.
- **`db:fresh` alias** — `db:migrate:fresh` now works as an alias.
- **`db:reset` aliases** — `db:migrate:reset` and `db:wipe` now work as aliases.
- **`serve --src` flag** — allows specifying a custom source directory.
- **`queue:work` comma-separated queues** — `--queue=default,mail,maintenance` now properly parses comma-separated values.
- **`deploy:init --pm` supports `bun`** — package manager flag now accepts `bun` in addition to `npm|pnpm|yarn`.

#### Frontend

- **Dialog keyboard shortcuts** — `bindKeys` with Enter (OK) and Escape (Cancel), guarded by `shell.isConnected`. `stopPropagation` added to prevent event bubbling.
- **Auth pages use logo** — all five auth pages (`login`, `register`, `forgotPassword`, `resetPassword`, `verifyEmail`) display `logo.png` from the Sidebar component.
- **Pulse timing fix** — `pulse.channel()` moved to `onMounted` with null guard to prevent race conditions.
- **Theme dark primary** — template dark theme primary changed from `$warning` (yellow) to `#3b8eed` (VitePress blue).

#### Logger

- **Winston → Pino** — `support/logger.ts` rewritten to use Pino with `fatal`, `trace`, and `child()` methods. `config/logging.ts` now uses Pino-style config (`level: "info"`, `httpRequests: true`).

### Fixes

- **Boolean parsing unified** — all maker-cli scripts use `!== "false" && !== "0"` for boolean env parsing, matching the Zod schema logic.
- **Plain/OpenAPI stubs** — example and notification modules now have plain and OpenAPI variants based on `OPEN_API` flag.
- **Sync-template basename check** — `skipDirs` filter in `sync-template.mjs` now correctly checks basename instead of full path.
- **Notification module refactor** — removed 4 injection functions and Vue file generation; backend-only.
- **DataTable sort removed** — documentation corrected to reflect that DataTable does not handle sort internally.
- **`useGumForm` `onProgress` removed** — documentation corrected; `form.progress` is updated internally, not via options.
- **`useAuth` composable** — documentation rewritten to reflect actual API: `user`, `isAuthenticated`, `setUser`, `clearUser`, `hasRole()`.

### Documentation

- **Full VitePress redesign** — docs site rebuilt with VitePress, blue brand color (`#3b8eed`), identical layout structure to Vue.js docs.
- **Sidebar restructured** — new sections: Getting Started, Essentials, Services, Frontend, Support, Others.
- **Logo & favicon** — integrated into docs `public/`, template assets, Sidebar.vue, and all auth pages.
- **Deploy docs rewritten** — `overview.md`, `local.md`, `remote.md` rewritten to match actual source code: corrected Dockerfile examples, file trees, env variable tables, workflow step order, and added `rsyncSshPath`/`rsyncSshOptions` config fields.
- **CLI docs fixed** — command counts corrected (Module 16, Database 14, Runtime 14, Deploy 6), missing `module:make-test` added, `--view` options corrected (no `bullmq`), `serve --src` documented.
- **Components docs rewritten** — DataTable (props/slots/events/PaginatedData interface), Datepicker (4 modes), Select (FetchPack/cascade/resetKey), FeatureButton.
- **Composables docs rewritten** — `useAuth()` actual API, `hasRole()`, `authUser`.
- **Helpers docs rewritten** — `formatCompactNumber`, `inArray`, `empty`, `downloadFile`, `downloadExcel`, `formatTaxPeriod`, `formatDate`.
- **Support docs fixed** — cookie name (`nexgen`), JWT expiries (900/3600/2592000), logger (Pino not Winston), mail settings moved to config file section.
- **Env docs updated** — `SOCKET` added to Application table, `FRONTEND` description updated, config entries removed.
- **Modules docs** — default column swapped to `OPEN_API=false`.
- **READMEs rewritten** — GitHub README with donate button (Support Kori + GitHub Sponsors), runtime/package manager tables; npm README with professional text.

### Dependencies

- **Logger**: Winston replaced by Pino
- **Docs**: VitePress added as dev dependency

### Upgrade Notes

**This is a major release with breaking changes.** Upgrading from v2.x requires manual steps.

1. **Folder structure changed** — review the new architecture and adjust imports if you moved files outside the standard structure.
2. **Update `config/realtime.ts`** — now reads `env.SOCKET` instead of hardcoding `enabled: true`. Ensure `SOCKET` is set in your `.env`.
3. **Update `config/queue.ts`** — `queueUiAllowedEmails` moved from `redis.ts`. If you customized it, move the value.
4. **Update `.env`** — add `OPEN_API=false`, `REDIS=false`, `FRONTEND=true`, `SOCKET=true` if not present.
5. **Re-run `deploy:init --force`** — deploy env templates changed significantly; regenerate all deploy files.
6. **Logger** — Winston replaced by Pino. If you imported `winston` directly, switch to `pino`. Run `npm install` to pick up the new dependency.
7. **Notification module** — Vue file generation removed. If you relied on `NotificationBell.vue` or `index.vue` stubs, they no longer exist.
8. **Boolean env parsing** — unified to `!== "false" && !== "0"`. Values like `"no"` or `"off"` are now treated as `true`. Use `"false"` or `"0"` to disable.
9. **CLI command changes** — `deploy:local` and `deploy:remote` removed; use `deploy:workflow` and `deploy:workflow:remote`. `--view=bullmq` removed from `dev` command.

---

## [2.3.0] — 2026-08-12

### Overview

Consolidated the 16 deploy CLI commands into a single 6-command surface (`deploy:init`, `deploy:workflow`, `deploy:workflow:remote`, `deploy:workflow:promote`, `deploy:db:import`, `deploy:db:import:remote`) and added nginx-proxy reverse proxy support to the generated compose files. Also shipped a batch of bug fixes across the scheduler, mail, database import, and frontend components, plus a new `Datepicker` component and a Public Sans UI font.

### Features

#### Deploy CLI

- **Deploy commands consolidated from 16 → 6** — the many `deploy:create:*`, `deploy:server`, `deploy:app`, `deploy:workflow:*` variants collapsed into:
  - `deploy:init` — generate app + server scaffolding and both workflow configs (`--app-only`, `--server-only`, `--dev`, `--force`, `--runtime`, `--pm`)
  - `deploy:workflow` — local pipeline from a config file or flags (`--server-only`, `--app-only`, `--refresh`, `--dry-run`)
  - `deploy:workflow:remote` — upload via `rsync`/`scp` and deploy on a remote host
  - `deploy:workflow:promote` — run local workflow, then remote workflow
  - `deploy:db:import` / `deploy:db:import:remote` — SQL dump import with auto-detected MySQL or PostgreSQL
  - Legacy names (`deploy:create`, `deploy:server`, `deploy:app`, `deploy:db:import`) still work inside workflow config files
- **`deploy:init` generates workflow configs** — `deploy/workflow.local.json` and `deploy/workflow.remote.json` are created automatically, so no separate init step is needed. The local workflow uses `deploy:workflow --server-only` / `--app-only` steps.
- **Reverse proxy (nginx-proxy) support** — generated app compose attaches to the external `nginx-proxy` network and reads `VIRTUAL_HOST`, `VIRTUAL_PORT`, `LETSENCRYPT_HOST`, `LETSENCRYPT_EMAIL` from `deploy/.env` for domain routing and auto-SSL.
- **`APP_URL` env variable** — added to deploy env templates (used for links, redirects, CORS). Also wired into the app compose `APP_URL` default.
- **PostgreSQL dump import** — `deploy:db:import` now auto-detects the dialect (MySQL or PostgreSQL) and restores PostgreSQL into a fresh database by default (`DROP DATABASE ... WITH (FORCE)` + recreate); pass `--no-drop` to keep the existing database.
- **`preDeployCommands`** — remote workflow config gained an array of commands run on the remote host before the app starts (e.g. `docker rm -f old-app`).
- **pgAdmin servers.json mount** — server compose mounts `./pgadmin/servers.json` into the pgAdmin container as read-only.
- **Bun Dockerfile copies `.env`** — `deploy/.env` is copied into the image before schema generation so `db:schema` runs with the right `DATABASE_URL`.

#### Mail

- **`MAIL_ENCRYPTION` env variable** — new `ssl` | `tls` | `none` option (default `none`). `ssl` enables implicit TLS (port 465), `tls` enables STARTTLS (port 587). The mail transport now sets `secure` from this value instead of hardcoding `false`.

#### Scheduler

- **Run-on-init + console output** — `runOnInit` schedules now run sequentially after all cron jobs are registered, under a "Running Scheduled Commands" header. Every run logs the task name with its elapsed time (or `FAIL` on error). `startScheduler()` returns the number of registered schedules (logged as `Scheduler started [N schedule(s)]`).

#### Frontend

- **`Datepicker.vue` component** — new date/datetime/month/year picker wrapping `@vuepic/vue-datepicker` (added as a dependency), with a native `input[type=month]` fallback for month mode on Firefox.
- **Public Sans font** — self-hosted WOFF2 (latin + latin-ext) wired into `body`, `--bs-body-font-family`, and `--bs-font-sans-serif`.
- **Skeleton theme variables** — `--app-skeleton` / `--app-skeleton-hi` added to both light and dark themes; `DataTableSkeleton` uses the theme-aware `skeleton card border` classes instead of hard-coded white.
- **`FeatureButton` render slot** — supports a default slot for compound header controls (dropdowns etc.); header renders the slot inside a wrapper with the same order/class as a normal button. `attrs` prop renamed to `buttonClass`.
- **`Input` `echallan-number` category** — new formatting category that uppercases and forces `V` + 9 digits.
- **`Select` search pinning** — after clearing a search, the last search results are pinned on top of the refetched full list so you don't lose your place.
- **`TextArea` default rows** — added `rows="3"` default.
- **`Header.vue`** — "My Profile" is now a real `<router-link to="/profile">` instead of a dead `href="#"`; ordering classes and `title` attributes cleaned up.
- **`Pagebar`** — simplified title logic (`title` shown only when there's no default slot).
- **`Pagination`** — adds a `pagination-${variant}` class.
- **Dialog theming** — overlay uses `var(--app-backdrop)` / `var(--app-text)` and the card header/footer no longer hard-code `bg-white`, so dialogs follow light/dark mode automatically.
- **Helpers** — added `formatTaxPeriod()` (`yyyy-MM` → `MMM yyyy`) and `formatDate()` (ISO → `dd MMM yyyy`).
- **`.fs-7`** — 12px font-size helper class.

### Fixes

- **Deploy DB dialect detection** — `detectMigrationDialectFromSql` now checks PostgreSQL hints first (`GENERATED ALWAYS AS IDENTITY`, `bigserial`, `serial`, `timestamp with time zone`, `public.`), uses MySQL-only hints (`auto_increment`, `engine=`, backticks), and no longer misdetects `varchar(` as MySQL.
- **Migration hooks under Bun** — `runMigrationHooks()` runs `bun` directly when running under Bun instead of `tsx dist/cli.mjs`, fixing `db:migrate` under the Bun runtime.
- **`auto-migrate.sh` hardening** — normalizes `AUTO_MIGRATE` (trims, lowercases, strips Windows `\r`) and documents the flow; `set -eu` retained.
- **Queue worker queues** — `maker dev` worker now also processes the `maintenance` queue (`--queue=default,mail,maintenance`).
- **`Button.vue`** — removed leftover `d-flex justify-content-center align-items-center custom-btn` classes.
- **Scheduler error handling** — a failing schedule run logs `FAIL` instead of crashing the scheduler process.
- **`RATE_LIMIT_LOGIN_MAX` default** — raised from `10` to `60` so legitimate login attempts aren't rate-limited during password reset workflows.

### Documentation

- **Deploy guide rewritten** — `cli/deploy.md`, `deploy/overview.md`, `deploy/local.md`, `deploy/remote.md` updated for the 6-command surface, including a removed-commands migration table and the new remote config (`upload`, `preDeployCommands`) and nginx-proxy SSL section.
- **Environment guide** — documented `MAIL_ENCRYPTION` and the new `RATE_LIMIT_LOGIN_MAX` default (also updated in the Rate Limiter guide).
- **Mail guide** — documented the `ssl` / `tls` / `none` encryption modes.
- **Scheduler guide** — documented the new console output and run-on-init behavior.
- **Components guide** — added `Datepicker` and `FeatureButton` sections, Input formatting categories, Select search pinning, and updated the component list.
- **Assets guide** — documented the Public Sans font and the theme CSS variables.
- **Helpers guide** — documented `formatTaxPeriod()` and `formatDate()`.
- **Runtime guide** — updated the `maker dev` worker queues.

### Dependencies

- **Added** `@vuepic/vue-datepicker@^14` (root + template)

---

## [2.2.5] — 2026-06-27

### Changed

- **Modal.vue refactored** — removed Bootstrap `Modal` JS dependency. The component now uses a native `data-bs-dismiss` button reference (`closeButton`) for closing, eliminating the need for `import Modal from "bootstrap/js/dist/modal.js"`, manual instance management, and backdrop cleanup logic. The `open()` method was removed as the parent caller manages visibility via the Bootstrap data API. Template attributes were also collapsed to single lines.

### Removed

- **Bootstrap Modal JS import** — removed `modal.js` import and `Modal` instance lifecycle (`getOrCreateModal`, `onMounted`, `onBeforeUnmount`, `dispose`). The modal is now fully Bootstrap data-API-driven.

---

## [2.2.4] — 2026-06-22

### Changed

- **Auto-create `public/` at boot** — `createKernel()` now calls `ensurePublicDir()` during startup (when `FRONTEND=true`), creating the `public/` directory if missing. The frontend static middlewares (`frontendStaticMiddleware`, `frontendIndexMiddleware`) are also lazily initialized via wrapper functions.

### Removed

- **`create-nexgen` template directory** — deleted all files under `packages/create-nexgen/template/` (`.dockerignore`, `.env`, `.env.example`, `README.md`, `biome.json`, `drizzle.config.ts`, `gitignore-stub`, `package.json`, database migrations, `src/env.ts`, framework internals, frontend resources, router, stores, plugins, types, and config files). These files are no longer bundled with the `create-nexgen` package.
- **Bumped `create-nexgen` version** — `packages/create-nexgen/package.json` updated from `2.2.3` to `2.2.4`.

---

## [2.2.3] — 2026-06-19

### Changed

- **Consolidated type declarations** — moved all `declare module` blocks from scattered `.d.ts` files (`src/resources/src/env.d.ts`, `src/resources/src/types/luxon.d.ts`, `src/framework/database/optional-db-drivers.d.ts`) into a single `src/types/global.d.ts`. Updated both root and resources `tsconfig.json` to include the central file. This gives both the backend and frontend projects access to module declarations (luxon, nodemailer, pg, vue-select, bootstrap JS, `*.vue`, better-sqlite3) without duplication.

---

## [2.2.2] — 2026-06-19

### Fixed

- **Queue worker database initialization** — `worker.ts` now calls `initDatabase()` before starting the queue worker and `closeDatabase()` on shutdown. Previously, job handlers that used the database threw "Database is not initialized" when running in a separate worker process.

### Changed

- **BullBoard dynamic queue discovery** — `ui.ts` now scans Redis for all queue `:meta` keys at boot and registers them automatically, eliminating the need to hardcode queue names in `ensureQueues()`. In development mode, a 15s poll timer rescans Redis and dynamically adds newly discovered queues to BullBoard via `addQueue()`. Polling is skipped in production where all queues are known upfront.
- **`setupBullBoard()` is now async** — `kernel.ts` uses `await setupBullBoard()` to support the Redis scan on boot.
- **Graceful shutdown** — `server.ts` imports and calls `stopBullBoardPoll()` to clear the dev poll timer on shutdown.

---

## [2.2.1] — 2026-06-17

### Fixed

- **Biome import fixup** — `organizeImports` stripped component imports used only in Vue `<template>` blocks. Restored 150+ missing imports across stats project, nexgen template, and create-nexgen template. Also reverted unsafe `noUnusedVariables` renames (`_logout`, `_themeIconClass`, `_startYear`/`_currentYear`) that broke template bindings. Added missing `vSelect` import (vue-select) and fixed `Object.hasOwn` → `in` operator for ES2020 compat.

---

## [2.2.0] — 2026-06-17

### Overview

Replaced ESLint + Prettier with Biome, unifying linting and formatting under a single tool with consistent code style applied across the entire codebase. Added `paginateModel()` for relational query pagination, `skipFetch` option in Gum for client-side navigation, and `FeatureButton` for extensible nav bar buttons. Fixed paginate count query and removed dead `Refresh.vue` component.

### Features

#### Tooling

- **ESLint + Prettier removed** — replaced with Biome v2.5.0 (`preset: "recommended"`)
- **Biome config** — 8 rule overrides matching previous ESLint behavior: `noUnusedVariables`, `useExhaustiveDependencies`, `noConsole`, `noSwitchDeclarations`, `useOptionalChain`, `useDefaultSwitchClause`, `noParamAssign`, `useVueMultiWordComponentNames`
- **package.json scripts** — `lint`, `lint:fix`, `format`, `format:check` now use Biome
- **Removed 8 devDependencies** — `eslint`, `@eslint/js`, `eslint-plugin-vue`, `typescript-eslint`, `prettier`, `eslint-config-prettier`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
- **Deleted config files** — `eslint.config.js`, `.prettierrc`, `.prettierignore`
- **`.gitignore`** — added `coverage/` and `src/storage/trash/`

#### Database

- **`paginateModel()`** — new paginator for Drizzle relational queries (`db.query.table.findMany`) with support for `where`, `with`, `columns`, `extras`, `orderBy`, and custom `total`/`data` callbacks
- **`resolvePath()`** — extracted URL resolution helper used by `paginate()` and `paginateModel()`
- **Fixed paginate count query** — replaced broken `.as("paginate_rows")` with proper inner select for accurate total row counting

#### Frontend

- **`FeatureButton.vue`** — new component for registering extensible nav bar buttons via `inject("featureButtons")`
- **Header.vue** — replaced commented-out refresh button with `featureButtons` slot; removed dead `Refresh.vue`
- **`skipFetch` option** — `gum.visit()` / `useGum()` now supports `skipFetch: true` for client-side route transitions without a server roundtrip

#### Documentation

- **Rate Limiter** — new guide page covering per-IP and per-session rate limiter configuration
- **Database** — updated migration and seeding docs
- **Environment** — documented new `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_LOGIN_MAX` variables
- **Events & Queue** — minor corrections
- **Components** — expanded API reference
- **Gum** — documented `skipFetch` option

### Fixes

- **Paginate count query** — count subquery now uses `db.select({ val: sql\`1\` }).from(query.as("\_inner"))`instead of broken`.as("paginate_rows")` pattern
- **Subcriteria dropdown** — `subcriteriaDD` returns `null` when no criteria is selected, preventing unnecessary API requests
- **FloatButton** — simplified template; renamed unused `floatStyle` to `_floatStyle` for Biome compliance
- **env.d.ts** — added blank line separators between `declare module` blocks for Biome formatting

### Dependencies

- **Runtime**: Node.js >= 24 or Bun >= 1.3 (unchanged)
- **Database**: SQLite (default), MySQL, or PostgreSQL (unchanged)
- **Optional**: Redis (unchanged)
- **Dev**: ESLint + Prettier removed, Biome v2.5.0 added

### Upgrade Notes

Run `npm install` to pick up new devDependencies. Run `npx biome check --write .` to reformat any open feature branches. The `paginate()` function's internal count query changed — if you were relying on the old `.as("paginate_rows")` pattern, no migration needed as it was internal.

---

## [2.1.1] — 2026-06-05

### Overview

First stable release of **nexgen** — a full-stack TypeScript framework built on Hono, Vue 3, and Drizzle ORM. This release covers the complete feature set: modular architecture, Redis-backed services, real-time broadcasting, authentication, OpenAPI docs, frontend SPA, maker CLI, and Docker deployment.

### Features

#### Core Framework

- **Hono HTTP server** with Zod-validated middleware stack (session, CORS, logger, rate limiter)
- **Modular monolith** — self-contained modules under `src/modules/` with auto-discovered routes, jobs, models, and seeders
- **OpenAPI / Scalar** — auto-generated API documentation at `/api-docs` with JSON spec at `/doc`
- **Health endpoint** at `GET /health`
- **File storage** — local disk or S3-compatible storage with signed URLs
- **Dual database** — SQLite, MySQL, or PostgreSQL via Drizzle ORM

#### Authentication & Security

- **JWT auth** — access + refresh token rotation with signed httpOnly cookies
- **Email verification** — optional `AUTH_REQUIRE_EMAIL_VERIFICATION` flow
- **Password reset** — token-based forgot/reset with queue-emailed links
- **Role middleware** — `requireRole("admin")` guard for admin routes
- **Rate limiting** — per-IP rate limiter middleware

#### Redis-Backed Services (optional)

- **Cache** — TTL-based key-value cache with `cache.get/put/forget/remember`
- **Session** — server-side session store with httpOnly cookie, auto-refresh
- **Queue** — BullMQ job processing with `shouldQueue` decorator, retries, backoff
- **Realtime** — Socket.IO with Redis adapter for multi-instance broadcasting
- **Scheduler** — cron-based `defineSchedule` with distributed Redis lock
- **BullBoard** — live queue dashboard at `/bullmq`
- **Redis Commander** — GUI at configurable port (1369)

#### Events & Realtime

- **String-based event dispatcher** — `dispatchEvent(name, payload, options)` with broadcast and queue support
- **Socket.IO server** — automatic room joining by auth, user ID, and role
- **Frontend Pulse plugin** — `pulse.channel(name).listen(event, callback)` API
- **Notifications system** — `notify()` persists to database and optionally broadcasts + emails
- **Mail queue** — dedicated `mail` queue for async email delivery (nodemailer + SMTP)

#### Maker CLI

- `maker dev` — starts API server, frontend HMR, queue worker together
- `maker module:make` — scaffolds controllers, routes, models, seeders, jobs, schedules
- `maker db:migrate --seed` — generates schema, runs migrations, seeds
- `maker serve --prod` — production mode with compiled `dist/`
- `maker queue:work` — BullMQ worker process
- `maker schedule:work` — cron scheduler worker
- `maker deploy` — Docker-based deployment with nginx-proxy and SSL

#### Frontend (Vue 3 SPA)

- **Gum plugin** — Inertia-style page visits, form handling with validation errors, scroll preservation, `useGumRemember()` for local UI state
- **Pulse plugin** — Socket.IO realtime channels with room-based event listening
- **Dialog plugin** — programmatic `alert()`, `confirm()`, `prompt()` modals
- **Auth pages** — login, register, forgot/reset password, email verification
- **UI components** — DataTable (server-side pagination), Select (API-fetched with infinite scroll), Modal, Toast, Button, Input, Switch, and 12 more
- **DataTable** — full server-side pagination, search, bulk delete, skeleton loading, slot-based customization
- **Theme system** — light/dark/auto with SCSS variable overrides
- **Route progress bar** — animated navigation indicator
- **Pinia stores** — auth store with session bootstrap, admin-ui store with sidebar + theme state
- **Axios interceptor** — 401 auto-redirect to `/login`

#### Documentation

- Comprehensive VitePress docs with full API reference for every plugin, component, and subsystem
- Dedicated pages for Gum, Pulse, Dialog, Router, Stores, Composables, Components, Validation, Assets, Axios
- Architecture guide with boot sequence diagram and middleware stack
- Complete env variable reference with feature interaction map
- Module development guide with OpenAPI stub variants

#### Deployment

- **Docker Compose** — two-layer deploy: app server + nginx-proxy with auto-SSL
- **Local deploy** — `maker deploy:local` with containerized MySQL and Redis
- **Remote deploy** — `maker deploy:remote` with SSH and Docker context
- **CI/CD** — GitHub Actions workflow for docs deployment

### Fixes

- Signed cookie auth with separate frontend/app URL support
- Raw SQL query support in migrations (indexes, alter table)
- Seeder execution sequence ordering
- OpenAPI route tag placeholder handling
- Modal and toast component edge cases
- Zod async `safeParse` for async validation schemas
- Template sync for publish workflow

### Dependencies

- **Runtime**: Node.js >= 24 or Bun >= 1.3
- **Database**: SQLite (default), MySQL, or PostgreSQL
- **Optional**: Redis (for cache, session, queue, realtime, scheduler)

### Upgrade Notes

This is the first stable release. No upgrade path from earlier versions since none were tagged.
