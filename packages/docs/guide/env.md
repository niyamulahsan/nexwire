# Environment

nexwire uses a Zod-validated `.env` file at the project root. The scaffolder writes a working one for you — a fresh project runs with no setup — and ships `.env.example` beside it as the reference for what you can change.

::: tip Windows
There is nothing to copy on a fresh project. If you ever need to recreate the file by hand, note that `cp` does not exist in cmd or PowerShell — use `copy .env.example .env` there, and `cp .env.example .env` on macOS and Linux.
:::

## Application

| Variable       | Default                 | Description                                                                                    |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `APP_NAME`     | `nexwire`               | Application name used in logging and email headers                                             |
| `APP_ENV`      | `development`           | Runtime environment: `development`, `production`, or `test`                                    |
| `APP_PORT`     | `3000`                  | HTTP server port                                                                               |
| `APP_URL`      | `http://localhost:3000` | Public-facing URL of the application (required)                                                |
| `UI`           | `true`                  | Set `false` for API-only mode (no UI build/serve)                                              |
| `FRONTEND_URL` | —                       | Separate frontend URL when UI is on a different domain. Leave empty when served from `APP_URL` |
| `SOCKET`       | `false`                 | Enable/disable Socket.IO on both backend and UI                                                |

## Database

| Variable       | Default                                        | Description                                            |
| -------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL` | `sqlite:./src/storage/database/nexwire.sqlite` | Database connection string (SQLite, MySQL, PostgreSQL) |

## Redis

| Variable       | Default                  | Description                                   |
| -------------- | ------------------------ | --------------------------------------------- |
| `REDIS`        | `false`                  | Master switch for all Redis-backed subsystems |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Redis connection string                       |
| `REDIS_PREFIX` | `nexwire`                | Key prefix for all Redis namespacing          |

## JWT & Cookies

| Variable             | Default | Description                             |
| -------------------- | ------- | --------------------------------------- |
| `JWT_ACCESS_SECRET`  | —       | Access token signing secret (required)  |
| `JWT_REFRESH_SECRET` | —       | Refresh token signing secret (required) |
| `COOKIE_SECRET`      | —       | Cookie signing secret (required)        |

## Security

| Variable           | Default | Description                                                                                                                                                                                                                                                |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECURITY_HEADERS` | `true`  | Enables browser security headers (CSP, HSTS, X-Frame-Options, nosniff). Works in **both** dev and prod. Set `false` to disable **all** security headers — useful when a CSP/HSTS/X-Frame setting fights a CDN, HMR, or third-party iframe you must support |

## Mail

| Variable        | Default | Description   |
| --------------- | ------- | ------------- |
| `MAIL_USERNAME` | `""`    | SMTP username |
| `MAIL_PASSWORD` | `""`    | SMTP password |

## Storage

| Variable                    | Default | Description                                       |
| --------------------------- | ------- | ------------------------------------------------- |
| `STORAGE_ACCESS_KEY_ID`     | —       | S3-compatible access key (required when using S3) |
| `STORAGE_SECRET_ACCESS_KEY` | —       | S3-compatible secret key (required when using S3) |

## Feature Toggles

### `REDIS`

- **Type:** boolean (`true` / `false`)
- **Default:** `false`

Controls all Redis-backed subsystems. When `false`, the framework skips Redis entirely and every Redis-dependent feature degrades gracefully.

| Subsystem     | `REDIS=true`                                              | `REDIS=false`                                                         |
| ------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| **Queue**     | Jobs processed by persistent worker                       | Queue worker refuses to start. Jobs return `null`                     |
| **Cache**     | Redis-backed TTL cache                                    | All methods return `null` / fallback. Cache is a no-op                |
| **Session**   | Redis-backed session store                                | All methods return `null` / `false`. Cookie is set but no data stored |
| **Realtime**  | Socket.IO uses Redis adapter for multi-instance broadcast | Single-instance mode only                                             |
| **Scheduler** | Distributed Redis lock                                    | Falls back to database-level locking                                  |
| **BullBoard** | Live queue dashboard                                      | Dashboard shows "unavailable"                                         |

**Startup behavior:** Redis uses `lazyConnect`. If unreachable at startup, the server still boots — all Redis features log a warning and degrade.

### `SOCKET`

- **Type:** boolean (`true` / `false`)
- **Default:** `true`

Controls Socket.IO on both backend and UI:

| `SOCKET=true`                                             | `SOCKET=false`                         |
| --------------------------------------------------------- | -------------------------------------- |
| Socket.IO server starts                                   | No Socket.IO instance created          |
| UI Pulse client active                                    | UI Pulse client is a silent no-op      |
| `dispatchEvent()` with `broadcast` fans out via WebSocket | `broadcast` option is silently ignored |

### `UI`

- **Type:** boolean (`true` / `false`)
- **Default:** `true`

Controls whether the UI (Vue SPA) is served from the same API server.

| `UI=true`                              | `UI=false`             |
| -------------------------------------- | ---------------------- |
| Built Vue assets served from `public/` | Not served             |
| SPA fallback for unmatched routes      | Returns `404`          |
| Dev stack starts Vite on port 5173     | Only API server starts |

Use `UI=false` for API-only mode (separate UI, mobile app, third-party consumer).

### `OPEN_API`

- **Type:** boolean (`true` / `false`)
- **Default:** `true`

Controls the OpenAPI / Scalar documentation endpoint at `/api-docs`. Set `OPEN_API=false` in `.env` to disable. Routes still work when disabled — only the documentation endpoints are removed.

## Feature Interaction Map

```
REDIS=true
 ├── Queue worker required for async jobs
 ├── Cache persists across restarts
 ├── Sessions shared across instances
 ├── Socket.IO broadcasts across instances
 ├── Scheduler locks across instances
 └── BullBoard live dashboard

SOCKET=true
 └── REDIS=true  → multi-instance realtime
 └── REDIS=false → single-instance realtime

UI=true  → API + SPA monolith (no CORS issues)
UI=false → API-only (set FRONTEND_URL for CORS)

OPEN_API=true  → /api-docs + /doc
OPEN_API=false → bare API, no docs endpoints
```

## Configuration

All subsystem settings (cache TTL, JWT expiry, mail host, rate limits, etc.) are defined in the `src/config/` folder. See [Configuration](/guide/configuration) for details.
