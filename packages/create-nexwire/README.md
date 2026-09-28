<p align="center">
  <a href="https://nexwire.dev">
    <img alt="nexwire" src="https://raw.githubusercontent.com/niyamulahsan/nexwire/main/logo-favicon/nexwire.png" width="300">
  </a>
</p>

<h3 align="center">Full-stack TypeScript framework for modern web applications</h3>

<p align="center">
  <a href="https://niyamulahsan.github.io/nexwire"><img src="https://img.shields.io/badge/docs-nexwire.dev-3b8eed" alt="Documentation"></a>
  <a href="https://www.npmjs.com/package/create-nexwire"><img src="https://img.shields.io/npm/v/create-nexwire" alt="npm version"></a>
  <a href="https://github.com/niyamulahsan/nexwire/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
</p>

---

nexwire is a batteries-included TypeScript framework that combines modular backends (Hono, Express) with Drizzle ORM, BullMQ, Socket.IO, Redis, and a Vue 3 SPA frontend — all scaffolded with a single command and deployed with Docker Compose.

## Quick Start

### Hono (default)

```bash
npm create nexwire@latest my-app
cd my-app
npm install
npm run maker db:migrate --seed
npm run maker dev
```

### Express

```bash
npm create nexwire@latest my-app -- --engine=express
cd my-app
npm install
npm run maker db:migrate --seed
npm run maker dev
```

Your API is live at `http://localhost:3000`, Scalar docs at `/api-docs`, and the Vue frontend at `http://localhost:5173`.

Requires **Node.js >= 24** or **Bun >= 1.3**.

### Current directory

Scaffold directly into the current directory:

```bash
npm create nexwire@latest .
npm create nexwire@latest . -- --engine=express
```

Works with any package manager: `pnpm`, `yarn`, or `bun`.

### Package Manager

All examples use `npm` as the default. nexwire works with any major package manager:

| Manager  | Create project                     | Run commands          |
| -------- | ---------------------------------- | --------------------- |
| **npm**  | `npm create nexwire@latest my-app`  | `npm run maker <cmd>` |
| **pnpm** | `pnpm create nexwire@latest my-app` | `pnpm maker <cmd>`    |
| **yarn** | `yarn create nexwire@latest my-app` | `yarn maker <cmd>`    |
| **bun**  | `bun create nexwire@latest my-app`  | `bun maker <cmd>`     |
| **all**  | `npm create nexwire@latest .`       | current directory     |

### Runtime

nexwire runs on **Node.js** or **Bun** — pick whichever fits your deployment:

| Runtime     | Minimum version | Notes                                                                 |
| ----------- | --------------- | --------------------------------------------------------------------- |
| **Node.js** | `>= 24`         | Default. Uses `node` in Dockerfile.                                   |
| **Bun**     | `>= 1.3`        | Pass `--runtime=bun` to `deploy:init`. Uses `oven/bun` in Dockerfile. |

## Features

| Category            | What you get                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| **API**             | Hono/Express HTTP server with Zod validation, OpenAPI/Scalar docs, CORS, rate limiting |
| **Database**        | Drizzle ORM — SQLite, MySQL, or PostgreSQL. Auto-detected from `DATABASE_URL`.         |
| **Auth**            | JWT access + refresh token rotation, signed httpOnly cookies, role middleware          |
| **Queue**           | BullMQ background jobs with `shouldQueue` decorator and Bull Board dashboard           |
| **Realtime**        | Socket.IO with auto room joining (user, role, auth) and broadcast events               |
| **Cache & Session** | Redis-backed with graceful fallback when Redis is disabled                             |
| **Scheduler**       | Cron-based task scheduling with distributed Redis lock                                 |
| **Storage**         | Local disk or S3-compatible (AWS S3, R2, MinIO, DigitalOcean Spaces)                   |
| **Notifications**   | Database-persisted notifications with broadcast + mail delivery                        |
| **Frontend**        | Vue 3 SPA — Vite, Pinia, Vue Router, Bootstrap 5, real-time Pulse plugin               |
| **Security**        | CSP, HSTS, X-Frame headers — configured in one place, toggled per environment          |
| **Reliability**     | Circuit breakers for Redis, mail, and S3 with auto-fallback; startup config validation |
| **CLI**             | `maker` command for code generation, migrations, runtime, and deploy                   |
| **Deploy**          | Two-layer Docker Compose — nginx-proxy, auto SSL, supervisor                           |

## Architecture

```
src/
├── env.ts              # Zod-validated environment config
├── database/           # Drizzle schema, migrations, seeders
├── framework/          # Reusable engine (HTTP, auth, queue, cache, etc.)
├── modules/            # Application modules (auto-discovered)
├── middlewares/        # Auth & role guards
├── resources/          # Vue 3 SPA frontend
└── storage/            # Uploaded files & logs
```

### Modules

Every feature is a self-contained module under `src/modules/<name>/`:

```
src/modules/posts/
├── console/           # CLI commands & scheduled tasks
├── controllers/       # Request handlers + Zod schemas
├── database/
│   ├── models/        # Drizzle table definitions
│   └── seeders/       # Test data generators
├── jobs/              # BullMQ queue handlers
├── routes/            # HTTP route definitions (auto-discovered)
└── __test__/          # Unit test
```

Modules are **auto-discovered** — no manual registration. Create one with:

```bash
npm run maker module:make blog
npm run maker module:make-controller blog post
npm run maker module:make-route blog post
npm run maker module:make-model blog post
```

### Framework Facade

Access all subsystems through a single import:

```ts
import {
  db,
  cache,
  session,
  queue,
  dispatchEvent,
  notify,
  storage,
  jwt,
  mail,
  password,
  urls,
  logger,
} from "@/framework/facade.js";
```

## CLI Reference

| Command                        | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `maker dev`                    | Start API server + frontend HMR + queue worker |
| `maker serve [--prod]`         | API server (dev or production)                 |
| `maker queue:work`             | BullMQ worker process                          |
| `maker schedule:work`          | Cron scheduler                                 |
| `maker db:migrate --seed`      | Run migrations + seeders                       |
| `maker db:fresh`               | Drop all tables, re-migrate, re-seed           |
| `maker module:make <name>`     | Scaffold a new module                          |
| `maker deploy:init`            | Generate Docker deploy scaffolding             |
| `maker deploy:workflow`        | Local deploy (Docker Desktop)                  |
| `maker deploy:workflow:remote` | Remote deploy via SSH + rsync                  |

## Deployment

nexwire includes a complete Docker deployment system out of the box.

### Local (Docker Desktop)

```bash
npm run maker deploy:init        # Generate deploy files (one-time)
npm run maker deploy:workflow    # Build and start everything
```

### Remote (VPS / Cloud)

```bash
npm run maker deploy:init                      # Generate files
# Edit deploy/workflow.remote.json with your SSH details
npm run maker deploy:workflow:remote           # Deploy to server
```

The deploy system provisions:

- **Multi-stage Dockerfile** — builder (install + build) → runner (minimal production image)
- **Shared infrastructure** — nginx-proxy, MySQL/PostgreSQL, Redis, phpMyAdmin, pgAdmin
- **Auto SSL** — Let's Encrypt via nginx-proxy companion
- **Process supervisor** — API server, queue worker, cron scheduler, auto-migration
- **Two-layer architecture** — server infra runs once per host, app stack rebuilds per deploy

See the [deploy documentation](https://niyamulahsan.github.io/nexwire/deploy/overview) for full details.

## Documentation

Complete documentation is available at **[nexwire.dev](https://niyamulahsan.github.io/nexwire)**

## Contributing

Contributions are welcome. Open an issue or pull request on [GitHub](https://github.com/niyamulahsan/nexwire).

## License

nexwire is open-sourced software licensed under the [MIT license](LICENSE).
