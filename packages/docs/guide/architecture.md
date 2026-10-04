# Architecture

## Directory Layout

```
my-project/
├── src/
│   ├── config/             # All configuration setup
│   ├── database/           # Schema, migrations, connection
│   ├── framework/          # Reusable internals (HTTP, DB, Redis, etc.)
│   │   └── maker-cli/      # CLI source and stubs
│   ├── middlewares/        # Auth, role middlewares
│   ├── modules/            # Application modules
│   ├── resources/          # Vue 3 UI app
│   ├── storage/            # Uploaded and generated files
│   ├── types/              # TS global support
│   └── env.ts              # env validation with zod
├── deploy/                 # Docker deploy files
├── .env.example
└── package.json
```

## Layers

- **Framework** — Reusable engine (HTTP, database, Redis, cache, session, queue, events, realtime, scheduler, storage). Lives in `src/framework/`.
- **Modules** — Your application code. Auto-discovered for routes, jobs, console commands, models, seeders.
- **Resources** — Vue 3 UI built with Vite.
- **Database** — Drizzle schema and migrations, dialect-aware.

## Sharing Logic Across Modules

Modules are self-contained, but auth context helpers (`getCurrentUser`, `hasRole`) and other multi-module utilities cross module boundaries. **Never import another module's internals directly** — that leads to circular imports. Instead:

- **Module facade** → `src/modules/auth/facade.ts` (every module already depends on auth)
- **Generic multi-module logic** → `src/modules/<name>/facade.ts` (imports only the framework + DB models + module facade.ts, never facade.ts import to other module facade.ts -> circuler import will hapen)
- **Single-module logic** → that module's own `helpers.ts` (Don't import own facade.ts its own module)
- **Framework-stable utilities** → the facade (`@/framework/facade.js`)

### it has three rules

- **Rule 1 — Modules talk to each other ONLY through facades.**
- **Rule 2 — Facades NEVER import other facades.**
- **Rule 3 — Each module NEVER import/use its own facade.**

For the full pattern, circular-import example, and the dependency rule, see [Modules → Sharing Logic Between Modules](./modules#sharing-logic-between-modules).

## Boot Sequence

The application boots in three stages: **HTTP app setup** → **Kernel assembly** → **Server start**.

```
server.ts
  │
  ├─ 1. createKernel()
  │       │
  │       ├─ storage.init()                           Initialize storage driver (local/S3)
  │       │
  │       ├─ initRedis()                              Connect Redis (if REDIS=true)
  │       │
  │       ├─ createHttpApp()                          Build the HTTP app with middleware stack
  │       │    │
  │       │    ├─ createRouter()                      Create the engine router instance
  │       │    ├─ configureOpenApi()                  Setup OpenAPI/Scalar UI (if OPEN_API=true)
  │       │    ├─ app.use("*", sessionMiddleware)     Session cookie + Redis
  │       │    ├─ app.use("*", corsMiddleware)        CORS headers
  │       │    ├─ app.use("*", loggerMiddleware)      Request logging
  │       │    ├─ app.use("*", rateLimiterMiddleware) Rate limiting
  │       │    ├─ app.use("/storage/*", static)       Serve uploaded files
  │       │    ├─ app.get("/health")                  Health endpoint
  │       │    ├─ app.notFound(notFound)              404 handler
  │       │    └─ app.onError(onError)                Error handler
  │       │
  │       ├─ initDatabase()                           Connect database (SQLite/MySQL/Postgres)
  │       ├─ bootQueueJobs()                          Register queue job handlers
  │       ├─ registerModuleRoutes(app)                Auto-discover & register module routes
  │       ├─ setupQueueDashboard()                    Setup BullMQ dashboard UI
  │       └─ UI static (if UI=true & build exists)
  │
  ├─ 2. serve(app)                                    Start HTTP listener on APP_PORT
  │                                                   (Hono via @hono/node-server, Express via app.listen)
  │
  ├─ 3. initRealtime(server)                          Attach Socket.IO to HTTP server
  ├─ 4. setupSocketAdminUI()                          Socket.IO admin dashboard
  │
  └─ 5. registerShutdownSignals(shutdown)             Graceful cleanup on SIGINT/SIGTERM
```

### Stage 1 — HTTP App (`http/app.ts`)

`createHttpApp()` builds the application with the global middleware pipeline:

```
Request → sessionMiddleware → corsMiddleware → loggerMiddleware
→ rateLimiterMiddleware → [module routes] → response
```

Stack details:

| Middleware                | File                  | Purpose                                                |
| ------------------------- | --------------------- | ------------------------------------------------------ |
| `sessionMiddleware`       | `session/session.ts`  | Attaches/generates session cookie, refreshes Redis TTL |
| `corsMiddleware`          | `http/cors.ts`        | CORS headers from `corsConfig.origin`                  |
| `loggerMiddleware`        | `http/logger.ts`      | Structured request logging                             |
| `rateLimiterMiddleware`   | `http/ratelimiter.ts` | Rate limiting per session (auth) / per IP (guest)      |
| `storageStaticMiddleware` | `http/static.ts`      | Serve uploaded files from `/storage/*`                 |
| OpenAPI                   | `http/openapi.ts`     | Scalar API docs UI at `/api-docs` (if `OPEN_API=true`) |
| `notFound`                | `http/logger.ts`      | 404 JSON response                                      |
| `onError`                 | `http/logger.ts`      | Global error handler                                   |

### Stage 2 — Kernel (`kernel.ts`)

`createKernel()` assembles all framework services onto the HTTP app:

1. **Storage** — Initializes the file storage driver (local disk or S3)
2. **Database** — Connects to the configured dialect (SQLite/MySQL/Postgres) via Drizzle ORM
3. **Redis** — Connects to Redis if `REDIS=true`, otherwise all Redis-backed features gracefully no-op
4. **Queue jobs** — Scans modules and registers `shouldQueue` handlers with BullMQ
5. **Module routes** — Auto-discovers all route files under `src/modules/*/routes/` and registers them on the app
6. **BullBoard** — Mounts the BullMQ queue management dashboard
7. **UI** — If `UI=true` and a production build exists, serves the Vue 3 UI as static files

### Stage 3 — Server (`server.ts`)

The server entrypoint:

1. **Calls `createKernel()`** to get the assembled `app` and `bullBoard`
2. **Starts HTTP server** on the configured `APP_PORT`
3. **Initializes Socket.IO** — attaches realtime WebSocket to the HTTP server
4. **Sets up Socket.IO Admin UI** — web dashboard at `admin.socket.io`
5. **Prints startup info** — API docs URL, Redis status, BullBoard, Socket.IO, UI status, dev tool URLs
6. **Registers shutdown handlers** — on SIGINT/SIGTERM, gracefully closes realtime, queues, Redis, and HTTP

## Runtime Entrypoints

All three runtimes are **self-executing** — they wire their own dependency boot (DB/Redis/queue), register the shared shutdown handler, and run as standalone processes. Each returns a runtime handle (`ServerHandle`, `WorkerHandle`, `SchedulerHandle`).

| Entrypoint   | File                             | Entry function              | Wires at boot                                          |
| ------------ | -------------------------------- | --------------------------- | ------------------------------------------------------ |
| API Server   | `src/framework/server.ts`        | `startServer()`             | HTTP app, Socket.IO, Redis pub/sub broadcast sub       |
| Queue Worker | `src/framework/queue/worker.ts`  | `startQueueWorkerRuntime()` | Redis, BullMQ worker, `parseCsvOrFallback(queue list)` |
| Scheduler    | `src/framework/scheduler/run.ts` | `startSchedulerRuntime()`   | DB/Redis, scheduler boot, queue runtime                |

### Self-executing lifecycle & duplicate shutdown

Because each runtime is self-executing, a process can be started **and** hit a shutdown signal during the same boot — or the same runtime imported twice (e.g. a worker inside a scheduler). The framework guards against this:

- **`registerShutdownSignals`** (`src/framework/support/lifecycle.ts`) is the **single, shared** shutdown wiring point. It registers SIGINT/SIGTERM handlers once and tracks registered signals, so **duplicate registration is a no-op** — a worker started inside a scheduler doesn't register a second SIGINT handler that would double-shutdown the process.
- **Each runtime's `shutdown()`** drains its own resources (close Redis, BullMQ worker/scheduler, HTTP realtime) then calls `process.exit` — exactly once.
- Lifecycle helpers also provide `parseCsvOrFallback` (used by the worker to split the `QUEUE_NAMES` env CSV) and the `ShutdownSignal` type shared across all three handles.

> **App settings, not facade:** which queues the worker processes (`QUEUE_NAMES`) and whether the scheduler/worker auto-run (`APP_ROLE`/entrypoint choice) are **env/app settings** — resolved at boot via `parseCsvOrFallback`, never imported through the facade and never user-end API.

## Framework Structure

**nexwire**'s framework is organized into self-contained subsystems under `src/framework/`:

```
src/framework/
├── server.ts              # HTTP server entrypoint
├── kernel.ts              # App kernel (boots all subsystems)
├── facade.ts              # Public API surface
├── http/                  # Router, validation, OpenAPI, static files
│   ├── app.ts             # HTTP app factory (middleware stack)
│   ├── router.ts          # Router (createRouter, group)
│   ├── openapi.ts         # OpenAPI/Scalar configuration
│   ├── cors.ts            # CORS middleware
│   ├── ratelimiter.ts     # Rate limiting middleware
│   ├── logger.ts          # Request logging, 404, error handler
│   ├── static.ts          # UI & storage static file serving
│   └── validation.ts      # Zod validation helper
├── cache/                 # Redis/in-memory cache
├── database/              # Connection, pagination, schema, seed
├── events/                # Command & event dispatcher
│   └── dispatcher.ts      # dispatchEvent, dispatchCommand
├── maker-cli/             # CLI tool and stubs
├── modules/               # Module discovery and route registration
├── notification/          # Database-persisted notifications
├── queue/                 # BullMQ queue, worker, dashboard
│   ├── queue.ts           # Queue management (get, add, process)
│   ├── worker.ts          # Queue worker entrypoint
│   ├── ui.ts              # BullBoard dashboard
│   └── clear.ts           # Queue key cleanup
├── realtime/              # Socket.IO server, auth, broadcast, admin UI
│   ├── index.ts           # Realtime barrel (broadcast, initRealtime, closeRealtime, socketServer, ioServer)
│   ├── socket.ts          # Socket.IO server init, room joining, admin UI
│   ├── socket-cookie.ts   # Cookie-based Socket.IO auth
│   ├── broadcast.ts       # dispatchEvent → Socket.IO broadcast
│   ├── ui.ts              # http://admin.socket.io
│   └── types.ts           # TypeScript types for realtime events
├── redis/                 # Redis client connection
├── runtime/               # Node and Bun runtime and adapter
├── scheduler/             # Cron scheduler
│   ├── scheduler.ts       # Schedule registration and execution
│   ├── run.ts             # Scheduler worker entrypoint
│   └── lock.ts            # Distributed lock (Redis or DB)
├── session/               # Session management
├── storage/               # File storage (local/S3)
└── support/               # Utilities (JWT, mail, logger, lifecycle, etc.)
```

## Request Lifecycle

```
Client Request
    │
    ▼
HTTP listener (port 3000)  — Hono via @hono/node-server, Express via app.listen
    │
    ▼
sessionMiddleware          — Attach/generate session cookie, refresh Redis TTL
    │
    ▼
corsMiddleware             — Set CORS headers
    │
    ▼
loggerMiddleware           — Log request method, path, status, duration
    │
    ▼
rateLimiterMiddleware      — Check rate limits
    │
    ▼
Module Router              — Match route → run middleware → execute controller
│   │
│   ├─ authMiddleware (if route requires auth)
│   ├─ requireRole (if route requires specific role)
│   └─ Controller handler
│
├─ Success  → JSON response
├─ 404      → notFound handler
└─ Error    → onError handler (logs + returns 500)
```

## App Settings vs Facade — What Lives Where

> **The rule:** the facade is the **only user-facing surface**. Everything else is an **app setting** — declared in `src/config/`, validated at boot, wired automatically by the framework. It is **not** exported by the facade.Parameters use it; the framework runs it.

| Concern           | Settings live in                | Wired by framework                                                                            | Facade export? |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------- | -------------- |
| Security headers  | `src/config/security.ts`        | `src/framework/http/security.ts`                                                              | No             |
| Config validation | `src/config/validate.ts`        | Kernel boot (`validateConfig`)                                                                | No             |
| Metrics           | `src/config/metrics.ts`         | `src/framework/http/metrics.ts`                                                               | No             |
| Health / liveness | `src/config/health.ts`          | `http/app.ts` (`/ready`, `/live`, `/health`, `/metrics`, all mounted in the HTTP app factory) | No             |
| Circuit breaker   | `src/config/circuit-breaker.ts` | `src/framework/circuit-breaker`                                                               | No             |
| Rate limiting     | `src/config/rateLimit.ts`       | `http/ratelimiter.ts`                                                                         | No             |
| Storage facade    | —                               | —                                                                                             | **Yes**        |
| DB facade         | —                               | —                                                                                             | **Yes**        |
| Cache facade      | —                               | —                                                                                             | **Yes**        |
| Events / queue    | —                               | —                                                                                             | **Yes**        |

**Why this split:**

- **The facade stays small and stable** — it exposes only a deliberately chosen set of app-facing verbs: `storage`, `cache`, `db`/`database` (plus `paginate*`), `dispatchCommand`/`command`, `dispatchEvent`, `shouldQueue`/`queue`, `defineSchedule`, `session`, `notify`, `broadcast`, and a few support helpers (`createRoute`, `group`, `createRouter`, `validate`, `cache`, `cookie`, `jwt`, `logger`, `password`, `urls`, `mail`). Even that set is deliberately chosen; if in doubt, a concern is _not_ facade.
- **App settings are config-driven, not code-driven.** You never write `security.ts` middleware by hand — you fill in `config/security.ts` and the framework wires `http/security.ts` for you at boot.
- **Changing behavior never touches the facade or module code** — edit the config file, restart, done.
- **Circuit breaker, validation, and security are ops/framework concerns, not user-end API.** They exist so the app bootstraps cleanly and survives faults — app code shouldn't even know they exist.

### Orchestration endpoints (Kubernetes)

The framework auto-wires the container-probe endpoints you need for orchestration:

| Endpoint   | Purpose                            | K8s probe        |
| ---------- | ---------------------------------- | ---------------- |
| `/health`  | Process up (always 200 when alive) | `livenessProbe`  |
| `/ready`   | App booted, deps connected         | `readinessProbe` |
| `/live`    | App responding                     | `livenessProbe`  |
| `/metrics` | Prometheus-style counters          | —                |

These are mounted on the HTTP app by the framework — **you never define routes for them** in your modules. Kubernetes (or any orchestrator) hits the endpoint, reads the status, and decides pod health from it. Like circuit breaker, this is app/orchestration-level structure, not user code.

### Circuit breaker (app settings)

Circuit breaker is configured in `src/config/circuit-breaker.ts` (thresholds, reset timeout, half-open success count) and enforced by `src/framework/circuit-breaker` around shell/command execution. **It is not a facade export** — app modules shouldn't interact with it directly. It exists to prevent a failing dependency from cascading; the facade simply routes through it transparently.
