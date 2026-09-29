# Deploy Commands

Docker-based deployment commands for local and remote environments. See the [Deploy guide](/deploy/overview) for architecture details.

> Deploy commands skip `.env` loading via dotenv (they need to generate `.env` files first), but read `.env` directly via `fs` for dialect and feature-flag detection.

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

## Command Summary

| Command                                               | Purpose                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| [`deploy:init`](#deploy-init)                         | Generate deploy scaffolding (app + server) and both workflow configs   |
| [`deploy:workflow`](#deploy-workflow)                 | Run the local workflow — infra and/or app, from a config file or flags |
| [`deploy:workflow:remote`](#deploy-workflow-remote)   | Upload the project and deploy on a remote Docker host                  |
| [`deploy:workflow:promote`](#deploy-workflow-promote) | Run the local workflow, then the remote workflow                       |
| [`deploy:db:import`](#deploy-db-import)               | Import a SQL dump into the local Docker container                      |
| [`deploy:db:import:remote`](#deploy-db-import-remote) | Import a SQL dump into a remote Docker container via SSH               |

### `deploy:init`

Generate the full deploy scaffolding — Dockerfile, docker-compose, env templates, supervisor config, auto-migration script, shared infrastructure compose, and both workflow configs. Detection (database dialect, Redis, package manager) reads your `.env`.

Also creates `deploy/workflow.local.json` and `deploy/workflow.remote.json` (unless they already exist).

::: code-group

```bash [npm]
npm run maker deploy:init
npm run maker deploy:init -- --force
npm run maker deploy:init -- --runtime=bun
npm run maker deploy:init -- --pm=pnpm
npm run maker deploy:init -- --app-only
npm run maker deploy:init -- --server-only --dev
```

```bash [pnpm]
pnpm maker deploy:init
pnpm maker deploy:init --force
pnpm maker deploy:init --runtime=bun
pnpm maker deploy:init --pm=pnpm
pnpm maker deploy:init --app-only
pnpm maker deploy:init --server-only --dev
```

```bash [yarn]
yarn maker deploy:init
yarn maker deploy:init --force
yarn maker deploy:init --runtime=bun
yarn maker deploy:init --pm=pnpm
yarn maker deploy:init --app-only
yarn maker deploy:init --server-only --dev
```

```bash [bun]
bun maker deploy:init
bun maker deploy:init --force
bun maker deploy:init --runtime=bun
bun maker deploy:init --pm=pnpm
bun maker deploy:init --app-only
bun maker deploy:init --server-only --dev
```

:::

### `deploy:workflow`

Run the local deploy workflow (Docker Desktop). With `--config`, reads the steps from a JSON file and runs each enabled step in sequence. Without `--config`, runs the built-in pipeline (shared infra, then app stack).

::: code-group

```bash [npm]
npm run maker deploy:workflow
npm run maker deploy:workflow -- --server-only
npm run maker deploy:workflow -- --app-only
npm run maker deploy:workflow -- --refresh
npm run maker deploy:workflow -- --config=deploy/workflow.local.json
npm run maker deploy:workflow -- --config=custom.json --dry-run
```

```bash [pnpm]
pnpm maker deploy:workflow
pnpm maker deploy:workflow --server-only
pnpm maker deploy:workflow --app-only
pnpm maker deploy:workflow --refresh
pnpm maker deploy:workflow --config=deploy/workflow.local.json
pnpm maker deploy:workflow --config=custom.json --dry-run
```

```bash [yarn]
yarn maker deploy:workflow
yarn maker deploy:workflow --server-only
yarn maker deploy:workflow --app-only
yarn maker deploy:workflow --refresh
yarn maker deploy:workflow --config=deploy/workflow.local.json
yarn maker deploy:workflow --config=custom.json --dry-run
```

```bash [bun]
bun maker deploy:workflow
bun maker deploy:workflow --server-only
bun maker deploy:workflow --app-only
bun maker deploy:workflow --refresh
bun maker deploy:workflow --config=deploy/workflow.local.json
bun maker deploy:workflow --config=custom.json --dry-run
```

:::

### `deploy:workflow:remote`

Full remote deploy pipeline — uploads the project via `rsync` (or `scp` as fallback), then runs server infra and/or app on the remote host.

**What happens:**

1. Creates target directory on remote: `ssh mkdir -p <targetPath>`
2. Uploads project (excludes `node_modules`, `.git`, `dist`, `.env*`)
3. Creates Docker networks on remote (`nginx-proxy`, `infra`) if missing
4. Starts server infra compose
5. Builds and starts app compose

::: code-group

```bash [npm]
npm run maker deploy:workflow:remote
npm run maker deploy:workflow:remote -- --config=deploy/workflow.remote.json
npm run maker deploy:workflow:remote -- --server-only
npm run maker deploy:workflow:remote -- --app-only
```

```bash [pnpm]
pnpm maker deploy:workflow:remote
pnpm maker deploy:workflow:remote --config=deploy/workflow.remote.json
pnpm maker deploy:workflow:remote --server-only
pnpm maker deploy:workflow:remote --app-only
```

```bash [yarn]
yarn maker deploy:workflow:remote
yarn maker deploy:workflow:remote --config=deploy/workflow.remote.json
yarn maker deploy:workflow:remote --server-only
yarn maker deploy:workflow:remote --app-only
```

```bash [bun]
bun maker deploy:workflow:remote
bun maker deploy:workflow:remote --config=deploy/workflow.remote.json
bun maker deploy:workflow:remote --server-only
bun maker deploy:workflow:remote --app-only
```

:::

### `deploy:workflow:promote`

Run the local workflow first (validate the build), then the remote workflow (deploy to production). Useful for pre-production testing.

::: code-group

```bash [npm]
npm run maker deploy:workflow:promote
npm run maker deploy:workflow:promote -- --config=deploy/workflow.remote.json
```

```bash [pnpm]
pnpm maker deploy:workflow:promote
pnpm maker deploy:workflow:promote --config=deploy/workflow.remote.json
```

```bash [yarn]
yarn maker deploy:workflow:promote
yarn maker deploy:workflow:promote --config=deploy/workflow.remote.json
```

```bash [bun]
bun maker deploy:workflow:promote
bun maker deploy:workflow:promote --config=deploy/workflow.remote.json
```

:::

### `deploy:db:import`

Import a SQL dump into the local Docker container. Auto-detects MySQL or PostgreSQL from `deploy/server/.env` (or the configured container name) and streams the file into the running container.

::: code-group

```bash [npm]
npm run maker deploy:db:import -- --file=deploy/nexwire.sql --database=nexwire
npm run maker deploy:db:import -- --file=dump.sql --database=myapp --container=mysql-global --user=root
```

```bash [pnpm]
pnpm maker deploy:db:import --file=deploy/nexwire.sql --database=nexwire
pnpm maker deploy:db:import --file=dump.sql --database=myapp --container=mysql-global --user=root
```

```bash [yarn]
yarn maker deploy:db:import --file=deploy/nexwire.sql --database=nexwire
yarn maker deploy:db:import --file=dump.sql --database=myapp --container=mysql-global --user=root
```

```bash [bun]
bun maker deploy:db:import --file=deploy/nexwire.sql --database=nexwire
bun maker deploy:db:import --file=dump.sql --database=myapp --container=mysql-global --user=root
```

:::

### `deploy:db:import:remote`

Import a SQL dump into a remote Docker container via SSH. Auto-detects MySQL or PostgreSQL from the `databaseImport.container` setting in the workflow config.

::: code-group

```bash [npm]
npm run maker deploy:db:import:remote -- --config=deploy/workflow.remote.json --file=deploy/nexwire.sql --database=nexwire
npm run maker deploy:db:import:remote -- --config=workflow.remote.json --file=dump.sql --database=myapp --dry-run
```

```bash [pnpm]
pnpm maker deploy:db:import:remote --config=deploy/workflow.remote.json --file=deploy/nexwire.sql --database=nexwire
pnpm maker deploy:db:import:remote --config=workflow.remote.json --file=dump.sql --database=myapp --dry-run
```

```bash [yarn]
yarn maker deploy:db:import:remote --config=deploy/workflow.remote.json --file=deploy/nexwire.sql --database=nexwire
yarn maker deploy:db:import:remote --config=workflow.remote.json --file=dump.sql --database=myapp --dry-run
```

```bash [bun]
bun maker deploy:db:import:remote --config=deploy/workflow.remote.json --file=deploy/nexwire.sql --database=nexwire
bun maker deploy:db:import:remote --config=workflow.remote.json --file=dump.sql --database=myapp --dry-run
```

:::

## Options Reference

### Shared flags

| Flag                        | Available on                                 | Purpose                                                               |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `--force`                   | `deploy:init`                                | Overwrite existing deploy files                                       |
| `--runtime=node\|bun`       | `deploy:init`                                | Choose Dockerfile runtime                                             |
| `--pm=npm\|pnpm\|yarn` | `deploy:init`                                | Package manager for the node runtime (default: auto-detect)           |
| `--app-only`                | `deploy:init`, workflows                     | Skip server infra, only app                                           |
| `--server-only`             | `deploy:init`, workflows                     | Skip app, only server infra                                           |
| `--dev`                     | `deploy:init`                                | Server infra in dev mode (exposed Redis port)                         |
| `--refresh`                 | `deploy:workflow`, `deploy:workflow:promote` | Regenerate deploy files before running                                |
| `--dry-run`                 | Workflows, `deploy:db:import:remote`         | Preview without executing                                             |
| `--config=<path>`           | Workflows                                    | Path to workflow JSON config                                          |
| `--file=<path>`             | `deploy:db:import:*`                         | Path to the SQL dump file                                             |
| `--database=<name>`         | `deploy:db:import:*`                         | Target database name                                                  |
| `--container=<name>`        | `deploy:db:import:*`                         | DB container (`mysql-global` or `postgres-global`)                    |
| `--user=<name>`             | `deploy:db:import:*`                         | DB user (defaults to server `.env`)                                   |
| `--password=<password>`     | `deploy:db:import:*`                         | DB password (defaults to server `.env`)                               |
| `--no-drop`                 | `deploy:db:import` (PostgreSQL)              | Keep the existing database instead of dropping it for a clean restore |

### Remote config (`deploy/workflow.remote.json`)

```json
{
  "remote": {
    "host": "203.0.113.10",
    "user": "deploy",
    "port": 22,
    "keyPath": "~/.ssh/id_rsa",
    "targetPath": "/home/deploy/nexwire"
  },
  "upload": {
    "source": ".",
    "targetSubPath": "."
  },
  "databaseImport": {
    "enabled": false,
    "file": "deploy/nexwire.sql",
    "database": "nexwire",
    "container": "mysql-global",
    "user": "root"
  },
  "preDeployCommands": ["docker rm -f old-app 2>/dev/null || true"]
}
```

### Local workflow config (`deploy/workflow.local.json`)

```json
{
  "steps": [
    {
      "name": "Generate deploy files",
      "run": "deploy:init --force",
      "enabled": false
    },
    {
      "name": "Start shared infra",
      "run": "deploy:workflow --server-only",
      "enabled": true
    },
    {
      "name": "Start app stack",
      "run": "deploy:workflow --app-only",
      "enabled": true
    },
    {
      "name": "Import database dump (optional)",
      "run": "deploy:db:import --file=deploy/nexwire.sql --database=nexwire",
      "enabled": false
    }
  ]
}
```

## Removed Commands

The following commands were merged into the six above and no longer exist:

| Removed command               | Replaced by                            |
| ----------------------------- | -------------------------------------- |
| `deploy:create`               | `deploy:init`                          |
| `deploy:create:app`           | `deploy:init --app-only`               |
| `deploy:create:server`        | `deploy:init --server-only`            |
| `deploy:create:server:dev`    | `deploy:init --server-only --dev`      |
| `deploy:server`               | `deploy:workflow --server-only`        |
| `deploy:app`                  | `deploy:workflow --app-only`           |
| `deploy:workflow:init`        | `deploy:init`                          |
| `deploy:workflow:local`       | `deploy:workflow`                      |
| `deploy:workflow:remote:init` | `deploy:init`                          |
| `deploy:remote:server`        | `deploy:workflow:remote --server-only` |
| `deploy:remote:app`           | `deploy:workflow:remote --app-only`    |

The old `deploy:create`, `deploy:server`, and `deploy:app` steps are still accepted inside a workflow config file for backward compatibility.
