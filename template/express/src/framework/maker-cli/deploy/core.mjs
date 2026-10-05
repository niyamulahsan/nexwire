import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { readCliConfig } from "../utils/env-config.mjs";
import { detectDeployDatabase, redisEnabled } from "../utils/env-db.mjs";
import { writeFileAlways, writeFileIfMissing } from "../utils/file-ops.mjs";
import { getOption, hasFlag } from "../utils/flags.mjs";
import { runCommand } from "../utils/process.mjs";

/** Expand ~ to the user's home directory in a file path. */
function expandHome(inputPath = "") {
  if (!inputPath?.startsWith("~")) return inputPath;
  return `${os.homedir()}${inputPath.slice(1)}`;
}

const stubsRoot = path.resolve(import.meta.dirname, "../stubs");

/** Template stubs used for deploy file generation. */
const STUBS = {
  deploy: {
    dockerfile: {
      node: {
        npm: "deploy/Dockerfile.stub",
        pnpm: "deploy/Dockerfile.pnpm.stub",
        yarn: "deploy/Dockerfile.yarn.stub"
      },
      bun: "deploy/Dockerfile.bun.stub"
    },
    composeByDatabase: {
      mysql: "deploy/compose/mysql.server.stub",
      postgres: "deploy/compose/postgres.server.stub",
      sqlite: "deploy/compose/sqlite.stub"
    },
    envByDatabase: {
      mysql: "deploy/env/mysql.server.stub",
      postgres: "deploy/env/postgres.server.stub",
      sqlite: "deploy/env/sqlite.stub"
    },
    readme: "deploy/README.stub",
    supervisor: {
      redis: "deploy/supervisor/redis.stub",
      noredis: "deploy/supervisor/noredis.stub"
    },
    autoMigrateScript: "deploy/scripts/auto-migrate.sh.stub",
    server: {
      compose: {
        redis: "deploy/server/compose/redis.stub",
        redisDev: "deploy/server/compose/redis.dev.stub",
        noredis: "deploy/server/compose/noredis.stub"
      },
      env: {
        redis: "deploy/server/env/redis.stub",
        noredis: "deploy/server/env/noredis.stub",
        localExample: "deploy/server/env/local.example.stub"
      },
      pgadminServers: "deploy/server/pgadmin/servers.stub",
      readme: "deploy/server/README.stub",
      nginxReadme: "deploy/server/nginx-vhost/README.stub",
      nginxHost: "deploy/server/nginx-vhost/app.example.com.stub",
      redisConfig: "deploy/server/redis/redis.conf.stub"
    },
    workflow: {
      local: "deploy/workflow/local.json.stub",
      remote: "deploy/workflow/remote.json.stub"
    }
  },
  controller: {
    openapi: "controller/openapi.ts.stub",
    plain: "controller/plain.ts.stub",
    schema: {
      openapi: "controller/schema.ts.stub",
      plain: "controller/schema.plain.ts.stub"
    }
  },
  route: {
    api: "route/api.ts.stub",
    plain: "route/plain.ts.stub"
  },
  model: {
    named: {
      mysql: "model/name.mysql.ts.stub",
      postgresql: "model/name.postgresql.ts.stub",
      sqlite: "model/name.sqlite.ts.stub"
    }
  },
  example: {
    schema: "example/schema.ts.stub",
    controller: "example/controller.ts.stub",
    routeApi: "example/route.api.ts.stub",
    job: "example/job.ts.stub",
    console: "example/console.ts.stub"
  },
  seeder: { named: "seeder/name.ts.stub" },
  job: { named: "job/name.ts.stub" },
  schedule: { named: "schedule/name.ts.stub" }
};

/** Read a stub file from the stubs directory. */
async function readStubRaw(name) {
  const file = path.join(stubsRoot, name);
  return fs.readFile(file, "utf8");
}

/** Read a stub file and replace {{key}} placeholders with the given values. */
async function renderStub(name, values = {}) {
  let content = await readStubRaw(name);
  for (const [key, value] of Object.entries(values)) content = content.replaceAll(`{{${key}}}`, String(value));
  return content.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

/** Pick the redis or noredis stub based on the redisEnabled flag. */
function pickRedisStub(redisOn, redisStub, noRedisStub) {
  return redisOn ? redisStub : noRedisStub;
}

/** Render multiple stubs and write them to the filesystem. */
async function writeRenderedFiles(root, entries = []) {
  for (const entry of entries) {
    const content = await renderStub(entry.stub, entry.values || {});
    await writeFileAlways(path.join(root, entry.output), content);
  }
}

/** Resolve whether Redis is enabled for deploy: explicit env REDIS wins,
 *  then root .env REDIS, then the src/config redisConfig.enabled literal
 *  (the source of truth). Matches Zod transform in env.ts. */
async function resolveRedisOn() {
  if (process.env.REDIS !== undefined) return redisEnabled();
  const rootRedis = (await readEnvValue(path.resolve(process.cwd(), ".env"), "REDIS")).toLowerCase();
  if (!rootRedis) return Boolean(readCliConfig().redisEnabled);
  return rootRedis !== "false" && rootRedis !== "0";
}

/** Resolve whether the UI build is enabled: explicit env UI wins,
 *  then root .env UI, else default true. Matches Zod transform in env.ts. */
async function resolveUIOn() {
  if (process.env.UI !== undefined) return process.env.UI !== "false" && process.env.UI !== "0";
  const rootUI = (await readEnvValue(path.resolve(process.cwd(), ".env"), "UI")).toLowerCase();
  if (!rootUI) return true;
  return rootUI !== "false" && rootUI !== "0";
}

/** Read a specific key from a .env file. Returns empty string if not found. */
async function readEnvValue(envPath, key) {
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    const idx = clean.indexOf("=");
    if (idx <= 0) continue;
    if (clean.slice(0, idx).trim() !== key) continue;
    return clean
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return "";
}

/** Ensure a .env file exists, copying from .example if missing. */
async function ensureEnvFile(envPath, examplePath) {
  try {
    await fs.access(envPath);
  } catch {
    try {
      await fs.copyFile(examplePath, envPath);
      console.log(`Created ${path.relative(process.cwd(), envPath)} from ${path.relative(process.cwd(), examplePath)}.`);
    } catch {
      throw new Error(`Missing env file: ${path.relative(process.cwd(), envPath)}. Create it first.`);
    }
  }
}

/** Ensure a Docker network exists, creating it if missing. */
async function ensureDockerNetwork(name) {
  try {
    await runCommand("docker", ["network", "inspect", name], { silent: true });
  } catch {
    await runCommand("docker", ["network", "create", name]);
  }
}

/** Replace the database name in a connection URL with a given name. */
function updateDatabaseNameInUrl(rawUrl, nextDbName) {
  try {
    const url = new URL(rawUrl);
    if (!nextDbName) return rawUrl;
    url.pathname = `/${nextDbName}`;
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** Replace ${variable} placeholders in a string with provided values. */
function expandEnvTemplate(value, vars = {}) {
  let out = String(value || "");
  for (const [key, val] of Object.entries(vars)) out = out.replaceAll(`\${${key}}`, String(val ?? ""));
  return out;
}

/** Ensure a bind-mount source file exists as a file (not a directory), creating from stub if needed. */
async function ensureBindMountFile(filePath, stubName) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    /* doesn't exist */
  }

  if (stat) {
    if (stat.isFile()) return;
    if (stat.isDirectory()) {
      console.log(`Fixing: ${path.relative(process.cwd(), filePath)} was a directory, replacing with file.`);
      await fs.rm(filePath, { recursive: true, force: true });
    }
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = await renderStub(stubName);
  await fs.writeFile(filePath, content, "utf8");
}

/** Parse remote workflow config file. */
async function readRemoteConfig(configPath) {
  const resolved = path.resolve(process.cwd(), configPath);
  const parsed = JSON.parse(await fs.readFile(resolved, "utf8"));
  const remote = parsed.remote || {};
  return {
    host: String(remote.host || "").trim(),
    user: String(remote.user || "").trim(),
    port: String(remote.port || 22).trim(),
    keyPath: expandHome(String(remote.keyPath || "").trim()),
    targetPath: String(remote.targetPath || "").trim(),
    preDeployCommands: Array.isArray(parsed.preDeployCommands) ? parsed.preDeployCommands : [],
    rsyncPath: parsed.rsyncPath ? String(parsed.rsyncPath).trim() : "",
    rsyncSshPath: parsed.rsyncSshPath ? String(parsed.rsyncSshPath).trim() : "ssh",
    rsyncSshOptions: Array.isArray(parsed.rsyncSshOptions) ? parsed.rsyncSshOptions.join(" ") : String(parsed.rsyncSshOptions || "").trim()
  };
}

/** Build SSH base args from config. */
function buildSshArgs(config) {
  const sshArgs = ["-p", config.port];
  if (config.keyPath) sshArgs.push("-i", config.keyPath);
  return { sshArgs, remoteHost: `${config.user}@${config.host}` };
}

/** Convert an absolute local path to a form rsync can read on the current OS. */
function toRsyncLocalPath(localPath) {
  if (process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(localPath)) {
    const drive = localPath[0].toLowerCase();
    const rest = localPath.slice(2).replace(/\\/g, "/").replace(/\/+$/, "");
    return `/cygdrive/${drive}${rest}/`;
  }
  return `${localPath.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
}

/** Convert a Windows path to forward slashes so cygwin rsync can exec it. */
function toRsyncSshPath(value) {
  return value.replace(/\\/g, "/");
}

/** Sync pgAdmin servers.json into the running pgAdmin container. */
async function syncPgAdminServers(deployRoot, envPath, localEnvPath) {
  const serversPath = path.join(deployRoot, "server", "pgadmin", "servers.json");
  try {
    await fs.access(serversPath);
  } catch {
    return;
  }
  const email = (await readEnvValue(localEnvPath, "PGADMIN_DEFAULT_EMAIL")) || (await readEnvValue(envPath, "PGADMIN_DEFAULT_EMAIL"));
  if (!email) return;
  try {
    await runCommand("docker", [
      "exec",
      "pgadmin",
      "sh",
      "-lc",
      `/venv/bin/python /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "${email.replace(/"/g, '\\"')}" --replace`
    ]);
    console.log(`pgAdmin servers synced for ${email}.`);
  } catch {
    console.log("Warning: could not auto-sync pgAdmin servers.");
  }
}

/** Update DATABASE_URL in the deploy env to match the server's actual database name. */
async function syncDeployDatabaseUrlWithServerEnv(deployEnvPath, serverEnvPath) {
  const appDatabaseUrlRaw = await readEnvValue(deployEnvPath, "DATABASE_URL");
  if (!appDatabaseUrlRaw) return;
  const appDatabaseUrl = decodeURIComponent(appDatabaseUrlRaw);
  const serverLocalEnvPath = `${serverEnvPath}.local`;
  const readServerValue = async (key) => (await readEnvValue(serverLocalEnvPath, key)) || (await readEnvValue(serverEnvPath, key));
  const expandedDatabaseUrl = expandEnvTemplate(appDatabaseUrl, {
    MYSQL_ROOT_PASSWORD: await readServerValue("MYSQL_ROOT_PASSWORD"),
    MYSQL_DATABASE: await readServerValue("MYSQL_DATABASE"),
    POSTGRES_USER: await readServerValue("POSTGRES_USER"),
    POSTGRES_PASSWORD: await readServerValue("POSTGRES_PASSWORD"),
    POSTGRES_DB: await readServerValue("POSTGRES_DB")
  });
  const lower = appDatabaseUrl.toLowerCase();
  const serverDbName = lower.startsWith("mysql")
    ? await readServerValue("MYSQL_DATABASE")
    : lower.startsWith("postgres") || lower.startsWith("postgresql")
      ? await readServerValue("POSTGRES_DB")
      : "";
  if (!serverDbName) return;
  const nextUrl = updateDatabaseNameInUrl(expandedDatabaseUrl, serverDbName);
  if (nextUrl === appDatabaseUrl) return;
  const content = await fs.readFile(deployEnvPath, "utf8");
  const updated = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${nextUrl}`);
  if (updated !== content) await fs.writeFile(deployEnvPath, updated);
}

/** Ensure the target database exists inside the running MySQL container. */
async function ensureDeployDatabaseReady(deployEnvPath, serverEnvPath) {
  const rawUrl = await readEnvValue(deployEnvPath, "DATABASE_URL");
  if (!rawUrl) return;
  const databaseUrl = decodeURIComponent(rawUrl);
  const lower = databaseUrl.toLowerCase();
  const serverLocalEnvPath = `${serverEnvPath}.local`;
  const readServerValue = async (key) => (await readEnvValue(serverLocalEnvPath, key)) || (await readEnvValue(serverEnvPath, key));
  if (lower.startsWith("mysql") || lower.startsWith("mariadb")) {
    const password = await readServerValue("MYSQL_ROOT_PASSWORD");
    if (!password) return;
    const dbName = (() => {
      try {
        const u = new URL(databaseUrl);
        return decodeURIComponent((u.pathname || "").replace(/^\/+/, ""));
      } catch {
        return "";
      }
    })();
    if (!dbName) return;
    await runCommand("docker", [
      "exec",
      "mysql-global",
      "mysql",
      "-uroot",
      `-p${password}`,
      "-e",
      `CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, "``")}\`;`
    ]);
    return;
  }
}

/** Generate deploy scaffolding files (Dockerfile, compose, env, etc.). */
export async function createDeploy(flags = []) {
  const deployRoot = path.resolve(process.cwd(), "deploy");
  const force = hasFlag(flags, "--force");
  const appOnly = hasFlag(flags, "--app-only");
  const serverOnly = hasFlag(flags, "--server-only");
  const isDev = hasFlag(flags, "--dev");
  const doApp = !serverOnly;
  const doServer = !appOnly;
  const runtimeFlag = flags.find((flag) => flag.startsWith("--runtime="));
  const runtime = runtimeFlag ? runtimeFlag.split("=")[1].trim().toLowerCase() : "node";
  const pmFlag = flags.find((flag) => flag.startsWith("--pm="));
  const nodePm = pmFlag ? pmFlag.split("=")[1].trim().toLowerCase() : "npm";
  const database = detectDeployDatabase(
    process.env.DATABASE_URL || (await readEnvValue(path.resolve(process.cwd(), ".env"), "DATABASE_URL"))
  );
  const redisOn = await resolveRedisOn();
  if (!force) {
    try {
      await fs.access(deployRoot);
      throw new Error("deploy folder already exists. Re-run with --force");
    } catch {}
  }
  const runtimeExec = runtime === "bun" ? "bun" : "node";
  const nodeDockerStub = STUBS.deploy.dockerfile.node[nodePm] || STUBS.deploy.dockerfile.node.npm;
  const composeStub = STUBS.deploy.composeByDatabase[database] || STUBS.deploy.composeByDatabase.sqlite;
  const envStub = STUBS.deploy.envByDatabase[database] || STUBS.deploy.envByDatabase.sqlite;
  if (doApp) {
    await writeRenderedFiles(deployRoot, [
      {
        output: "Dockerfile",
        stub: runtime === "bun" ? STUBS.deploy.dockerfile.bun : nodeDockerStub
      },
      {
        output: "docker-compose.yml",
        stub: composeStub,
        values: { REDIS_ENV_LINE: redisOn ? "      REDIS_URL: redis://redis-global:6379\n" : "" }
      },
      {
        output: ".env.example",
        stub: envStub,
        values: {
          REDIS_ENABLED: redisOn ? "true" : "false",
          OPEN_API: process.env.OPEN_API || (await readEnvValue(path.resolve(process.cwd(), ".env"), "OPEN_API")) || "false",
          SOCKET: process.env.SOCKET || (await readEnvValue(path.resolve(process.cwd(), ".env"), "SOCKET")) || "false",
          UI: (await resolveUIOn()) ? "true" : "false",
          SECURITY_HEADERS: process.env.SECURITY_HEADERS || (await readEnvValue(path.resolve(process.cwd(), ".env"), "SECURITY_HEADERS")) || "true",
          FRONTEND_URL: process.env.FRONTEND_URL || (await readEnvValue(path.resolve(process.cwd(), ".env"), "FRONTEND_URL")) || "",
          REDIS_PREFIX: process.env.REDIS_PREFIX || (await readEnvValue(path.resolve(process.cwd(), ".env"), "REDIS_PREFIX")) || "nexwire",
          JWT_ACCESS_SECRET:
            process.env.JWT_ACCESS_SECRET || (await readEnvValue(path.resolve(process.cwd(), ".env"), "JWT_ACCESS_SECRET")) || "",
          JWT_REFRESH_SECRET:
            process.env.JWT_REFRESH_SECRET || (await readEnvValue(path.resolve(process.cwd(), ".env"), "JWT_REFRESH_SECRET")) || "",
          COOKIE_SECRET: process.env.COOKIE_SECRET || (await readEnvValue(path.resolve(process.cwd(), ".env"), "COOKIE_SECRET")) || "",
          STORAGE_ACCESS_KEY_ID:
            process.env.STORAGE_ACCESS_KEY_ID || (await readEnvValue(path.resolve(process.cwd(), ".env"), "STORAGE_ACCESS_KEY_ID")) || "",
          STORAGE_SECRET_ACCESS_KEY:
            process.env.STORAGE_SECRET_ACCESS_KEY ||
            (await readEnvValue(path.resolve(process.cwd(), ".env"), "STORAGE_SECRET_ACCESS_KEY")) ||
            ""
        }
      },
      {
        output: "README.md",
        stub: STUBS.deploy.readme,
        values: {
          DATABASE_MODE: database,
          REDIS_STATUS: redisOn ? "yes" : "no",
          RUNTIME_NAME: runtime
        }
      },
      {
        output: "supervisor/supervisord.conf",
        stub: pickRedisStub(redisOn, STUBS.deploy.supervisor.redis, STUBS.deploy.supervisor.noredis),
        values: { RUNTIME_EXEC: runtimeExec, RUNTIME_NAME: runtime }
      },
      {
        output: "scripts/auto-migrate.sh",
        stub: STUBS.deploy.autoMigrateScript
      }
    ]);
  }
  if (doServer) {
    await writeRenderedFiles(deployRoot, [
      {
        output: "server/docker-compose.yml",
        stub: pickRedisStub(
          redisOn,
          isDev ? STUBS.deploy.server.compose.redisDev : STUBS.deploy.server.compose.redis,
          STUBS.deploy.server.compose.noredis
        )
      },
      {
        output: "server/.env.example",
        stub: pickRedisStub(redisOn, STUBS.deploy.server.env.redis, STUBS.deploy.server.env.noredis)
      },
      {
        output: "server/.env.local.example",
        stub: STUBS.deploy.server.env.localExample
      },
      {
        output: "server/pgadmin/servers.json",
        stub: STUBS.deploy.server.pgadminServers
      },
      {
        output: "server/README.md",
        stub: STUBS.deploy.server.readme
      },
      {
        output: "server/nginx-vhost/README.md",
        stub: STUBS.deploy.server.nginxHost
      },
      {
        output: "server/nginx-vhost/app.example.com",
        stub: STUBS.deploy.server.nginxHost
      },
      ...(isDev
        ? []
        : [
            { output: "workflow.local.json", stub: STUBS.deploy.workflow.local },
            { output: "workflow.remote.json", stub: STUBS.deploy.workflow.remote }
          ])
    ]);
    if (redisOn) await writeRenderedFiles(deployRoot, [{ output: "server/redis/redis.conf", stub: STUBS.deploy.server.redisConfig }]);
  }
  if (!doServer) {
    try {
      await fs.rm(path.join(deployRoot, "server"), { recursive: true, force: true });
    } catch {}
  }
}

/** Start the shared server infra (proxy, db, redis) or the app stack via Docker Compose. */
export async function runDeploy(commandName) {
  const deployRoot = path.resolve(process.cwd(), "deploy");
  if (commandName === "deploy:server") {
    const composePath = path.join(deployRoot, "server", "docker-compose.yml");
    const envPath = path.join(deployRoot, "server", ".env");
    const localEnvPath = path.join(deployRoot, "server", ".env.local");
    const localEnvExamplePath = path.join(deployRoot, "server", ".env.local.example");
    const envExamplePath = path.join(deployRoot, "server", ".env.example");
    try {
      await fs.access(composePath);
    } catch {
      console.log("Generating deploy/server/ files from stubs...");
      const redisOn = await resolveRedisOn();
      const serverDir = path.join(deployRoot, "server");
      await fs.mkdir(serverDir, { recursive: true });
      await writeRenderedFiles(serverDir, [
        {
          output: "docker-compose.yml",
          stub: redisOn ? STUBS.deploy.server.compose.redisDev : STUBS.deploy.server.compose.noredis
        },
        {
          output: ".env.example",
          stub: redisOn ? STUBS.deploy.server.env.redis : STUBS.deploy.server.env.noredis
        },
        {
          output: ".env.local.example",
          stub: STUBS.deploy.server.env.localExample
        }
      ]);
    }
    const redisOn = await resolveRedisOn();
    await ensureEnvFile(envPath, envExamplePath);
    await ensureEnvFile(localEnvPath, localEnvExamplePath);
    await ensureDockerNetwork("nginx-proxy");
    await ensureDockerNetwork("infra");
    await ensureBindMountFile(path.join(deployRoot, "server", "pgadmin", "servers.json"), STUBS.deploy.server.pgadminServers);
    if (redisOn) await ensureBindMountFile(path.join(deployRoot, "server", "redis", "redis.conf"), STUBS.deploy.server.redisConfig);
    await runCommand("docker", ["compose", "--env-file", envPath, "--env-file", localEnvPath, "-f", composePath, "up", "-d"]);
    await syncPgAdminServers(deployRoot, envPath, localEnvPath);
    return;
  }
  if (commandName === "deploy:app") {
    const composePath = path.join(deployRoot, "docker-compose.yml");
    const envPath = path.join(deployRoot, ".env");
    const envExamplePath = path.join(deployRoot, ".env.example");
    const serverEnvPath = path.join(deployRoot, "server", ".env");
    const serverEnvExamplePath = path.join(deployRoot, "server", ".env.example");
    await ensureEnvFile(envPath, envExamplePath);
    try {
      await fs.access(serverEnvExamplePath);
      await ensureEnvFile(serverEnvPath, serverEnvExamplePath);
    } catch {}
    try {
      await fs.access(serverEnvPath);
      await syncDeployDatabaseUrlWithServerEnv(envPath, serverEnvPath);
      await ensureDeployDatabaseReady(envPath, serverEnvPath);
    } catch {}
    const composeArgs = ["compose"];
    try {
      await fs.access(serverEnvPath);
      composeArgs.push("--env-file", serverEnvPath);
    } catch {}
    composeArgs.push("--env-file", envPath, "-f", composePath, "up", "-d", "--build", "--force-recreate");
    await runCommand("docker", composeArgs);
  }
}

/** Start shared server infra on remote host (via SSH). */
export async function runRemoteServer(flags = []) {
  const configFlag = flags.find((f) => f.startsWith("--config="));
  const configPath = configFlag ? configFlag.split("=")[1] : "deploy/workflow.remote.json";
  const config = await readRemoteConfig(configPath);
  const { sshArgs, remoteHost } = buildSshArgs(config);
  const cd = `cd "${config.targetPath}"`;
  const dryRun = hasFlag(flags, "--dry-run");

  console.log("Ensuring remote Docker networks...");
  if (dryRun) {
    console.log(
      `[dry-run] ssh ${[...sshArgs, remoteHost, `docker network inspect nginx-proxy >/dev/null 2>&1 || docker network create nginx-proxy`].join(" ")}`
    );
  } else {
    await runCommand("ssh", [
      ...sshArgs,
      remoteHost,
      `docker network inspect nginx-proxy >/dev/null 2>&1 || docker network create nginx-proxy`
    ]);
  }
  if (dryRun) {
    console.log(
      `[dry-run] ssh ${[...sshArgs, remoteHost, `docker network inspect infra >/dev/null 2>&1 || docker network create infra`].join(" ")}`
    );
  } else {
    await runCommand("ssh", [...sshArgs, remoteHost, `docker network inspect infra >/dev/null 2>&1 || docker network create infra`]);
  }

  console.log("Starting server infra containers...");
  if (dryRun) {
    console.log(
      `[dry-run] ssh ${[...sshArgs, remoteHost, `${cd} && docker compose --env-file deploy/server/.env -f deploy/server/docker-compose.yml up -d`].join(" ")}`
    );
  } else {
    await runCommand("ssh", [
      ...sshArgs,
      remoteHost,
      `${cd} && docker compose --env-file deploy/server/.env -f deploy/server/docker-compose.yml up -d`
    ]);
  }

  const localEmail = await readEnvValue(path.resolve(process.cwd(), "deploy/server/.env"), "PGADMIN_DEFAULT_EMAIL");
  if (localEmail) {
    console.log("Syncing pgAdmin servers...");
    if (dryRun) {
      console.log(
        `[dry-run] ssh ${[...sshArgs, remoteHost, `${cd} && docker exec pgadmin /venv/bin/python /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "${localEmail}" --replace 2>/dev/null || true`].join(" ")}`
      );
    } else {
      await runCommand("ssh", [
        ...sshArgs,
        remoteHost,
        `${cd} && docker exec pgadmin /venv/bin/python /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "${localEmail}" --replace 2>/dev/null || true`
      ]);
    }
  }
}

/** Build and start app stack on remote host (via SSH). */
export async function runRemoteApp(flags = []) {
  const configFlag = flags.find((f) => f.startsWith("--config="));
  const configPath = configFlag ? configFlag.split("=")[1] : "deploy/workflow.remote.json";
  const config = await readRemoteConfig(configPath);
  const { sshArgs, remoteHost } = buildSshArgs(config);
  const cd = `cd "${config.targetPath}"`;
  const dryRun = hasFlag(flags, "--dry-run");

  for (const command of config.preDeployCommands) {
    console.log(`Running pre-deploy command: ${command}`);
    if (dryRun) {
      console.log(`[dry-run] ssh ${[...sshArgs, remoteHost, `${cd} && ${command}`].join(" ")}`);
    } else {
      await runCommand("ssh", [...sshArgs, remoteHost, `${cd} && ${command}`]);
    }
  }

  console.log("Building and starting app containers...");
  if (dryRun) {
    console.log(
      `[dry-run] ssh ${[...sshArgs, remoteHost, `${cd} && docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build --force-recreate`].join(" ")}`
    );
  } else {
    await runCommand("ssh", [
      ...sshArgs,
      remoteHost,
      `${cd} && docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build --force-recreate`
    ]);
  }
}

/** Resolve DB credentials for dump import from server .env or DATABASE_URL. */
async function resolveDbCredentials(serverEnv) {
  const dbUrlRaw = await readEnvValue(path.join(path.dirname(serverEnv), "..", ".env"), "DATABASE_URL");
  let urlUser = "";
  let urlPassword = "";
  if (dbUrlRaw) {
    try {
      const url = new URL(dbUrlRaw);
      urlUser = decodeURIComponent(url.username || "");
      urlPassword = decodeURIComponent(url.password || "");
    } catch {}
  }
  return { dbUrlRaw, urlUser, urlPassword };
}

/** Detect import dialect (mysql|postgres) from env files or container name. */
export async function detectImportDialect(flags = [], serverEnv) {
  const { dbUrlRaw } = await resolveDbCredentials(serverEnv);
  const pgUser = await readEnvValue(serverEnv, "POSTGRES_USER");
  const pgPass = await readEnvValue(serverEnv, "POSTGRES_PASSWORD");
  const myPass = await readEnvValue(serverEnv, "MYSQL_ROOT_PASSWORD");
  if (pgUser || pgPass) return "postgres";
  if (myPass) return "mysql";
  if (String(dbUrlRaw).toLowerCase().startsWith("postgres")) return "postgres";
  if (String(dbUrlRaw).toLowerCase().startsWith("mysql")) return "mysql";
  const container = String(getOption(flags, "--container", "")).toLowerCase();
  if (container.includes("postgres")) return "postgres";
  return "mysql";
}

/**
 * Why: pg_dump from PostgreSQL 17+ emits `SET transaction_timeout = 0;`, which
 *      older servers (PG <= 16) reject with "unrecognized configuration parameter".
 * When: Importing a dump produced by a newer pg_dump into an older postgres-global.
 * Where: Used by importPgDumpLocal.
 * How: Line-buffers the stream and drops any line matching the pattern.
 */
function lineFilterTransform(match, onSkip) {
  let pending = "";
  return new Transform({
    transform(chunk, _enc, cb) {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) {
        if (match.test(line)) {
          onSkip?.(line);
        } else {
          this.push(line + "\n");
        }
      }
      cb();
    },
    flush(cb) {
      if (pending && !match.test(pending)) this.push(pending);
      cb();
    }
  });
}

/** Import a PostgreSQL dump file into the local postgres-global container. */
export async function importPgDumpLocal(flags = []) {
  const deployRoot = path.resolve(process.cwd(), "deploy");
  const serverEnv = path.join(deployRoot, "server", ".env");
  const sqlFile = path.resolve(process.cwd(), getOption(flags, "--file", "deploy/nexwire.sql"));
  const database = getOption(flags, "--database", "nexwire");
  const container = getOption(flags, "--container", "postgres-global");
  let user = getOption(flags, "--user", "");
  let password = getOption(flags, "--password", "");
  const { urlUser, urlPassword } = await resolveDbCredentials(serverEnv);
  if (!user) user = (await readEnvValue(serverEnv, "POSTGRES_USER")) || urlUser || "postgres";
  if (!password) password = (await readEnvValue(serverEnv, "POSTGRES_PASSWORD")) || urlPassword;
  if (!password) throw new Error("PostgreSQL password not found. Set POSTGRES_PASSWORD in deploy/server/.env or --password.");

  const envArgs = ["-e", `PGPASSWORD=${password}`];
  const psqlBase = ["exec", ...envArgs, container, "psql", "-U", user, "-d"];
  if (!hasFlag(flags, "--no-drop")) {
    await runCommand("docker", [
      ...psqlBase,
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`
    ]);
    console.log(`Dropped database ${database} for clean restore.`);
  }
  const ensureSql = `SELECT 'CREATE DATABASE ${database}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')\\gexec`;
  await new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", ...envArgs, container, "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"]
    });
    child.stdin.end(`${ensureSql}\n`);
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Failed to ensure database ${database} exists (code ${code})`))));
  });
  await new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", ...envArgs, container, "psql", "-U", user, "-d", database], {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"]
    });
    const input = fsSync.createReadStream(sqlFile);
    const sanitize = lineFilterTransform(/^\s*SET\s+transaction_timeout\b.*;?\s*$/, (line) =>
      console.log(`Skipped unsupported PostgreSQL setting: ${line.trim()}`)
    );
    input.on("error", reject);
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`PostgreSQL import failed with code ${code}`))));
    input.pipe(sanitize).pipe(child.stdin);
  });
}

/** Import an SQL dump into the local container, auto-detecting MySQL vs PostgreSQL. */
export async function importDumpLocal(flags = []) {
  const serverEnv = path.join(path.resolve(process.cwd(), "deploy"), "server", ".env");
  const dialect = await detectImportDialect(flags, serverEnv);
  if (dialect === "postgres") return importPgDumpLocal(flags);
  return importMysqlDumpLocal(flags);
}

/** Import a MySQL dump file into the local MySQL container. */
export async function importMysqlDumpLocal(flags = []) {
  const deployRoot = path.resolve(process.cwd(), "deploy");
  const sqlFile = path.resolve(process.cwd(), getOption(flags, "--file", "deploy/nexwire.sql"));
  const database = getOption(flags, "--database", "nexwire");
  const container = getOption(flags, "--container", "mysql-global");
  const user = getOption(flags, "--user", "root");
  let password = getOption(flags, "--password", "");
  if (!password) password = await readEnvValue(path.join(deployRoot, "server", ".env"), "MYSQL_ROOT_PASSWORD");
  if (!password) {
    const dbUrl = await readEnvValue(path.join(deployRoot, ".env"), "DATABASE_URL");
    try {
      if (dbUrl) password = decodeURIComponent(new URL(dbUrl).password);
    } catch {}
  }
  await runCommand("docker", [
    "exec",
    container,
    "mysql",
    `-u${user}`,
    `-p${password}`,
    "-e",
    `CREATE DATABASE IF NOT EXISTS ${database};`
  ]);
  await new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "mysql", `-u${user}`, `-p${password}`, database], {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"]
    });
    const input = fsSync.createReadStream(sqlFile);
    const sanitize = lineFilterTransform(/^\s*SET\s+transaction_timeout\b.*;?\s*$/, (line) =>
      console.log(`Skipped unsupported SQL setting: ${line.trim()}`)
    );
    input.on("error", reject);
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`MySQL import failed with code ${code}`))));
    input.pipe(sanitize).pipe(child.stdin);
  });
}

/** Import a MySQL dump file into a remote MySQL container via SSH. */
export async function importMysqlDumpRemote(flags = []) {
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configPath = configFlag ? configFlag.replace("--config=", "") : "deploy/workflow.remote.json";
  const parsed = JSON.parse(await fs.readFile(path.resolve(process.cwd(), configPath), "utf8"));
  const remote = parsed.remote || {};
  const host = String(remote.host || "").trim();
  const userHost = String(remote.user || "").trim();
  const port = String(remote.port || 22).trim();
  const keyPath = expandHome(String(remote.keyPath || "").trim());
  const targetPath = String(remote.targetPath || "").trim();
  const dbImport = parsed.databaseImport || {};
  const file = getOption(flags, "--file", String(dbImport.file || "deploy/nexwire.sql"));
  const database = getOption(flags, "--database", String(dbImport.database || "nexwire"));
  const container = getOption(flags, "--container", String(dbImport.container || "mysql-global"));
  const dbUser = getOption(flags, "--user", String(dbImport.user || "root"));
  const passwordFlag = getOption(flags, "--password", "");
  const passwordCmd = passwordFlag
    ? `MYSQL_ROOT_PASSWORD='${passwordFlag.replace(/'/g, "'\\''")}'`
    : `MYSQL_ROOT_PASSWORD=$(grep '^MYSQL_ROOT_PASSWORD=' deploy/server/.env 2>/dev/null | head -1 | cut -d '=' -f2-)`;
  const sshBaseArgs = ["-p", port];
  if (keyPath) sshBaseArgs.push("-i", keyPath);
  const remoteHost = `${userHost}@${host}`;
  const dryRun = hasFlag(flags, "--dry-run");

  const steps = [
    `cd "${targetPath}" && [ -f "${file}" ] || (echo "Missing SQL file: ${file}" && exit 1)`,
    `cd "${targetPath}" && ${passwordCmd} && docker exec ${container} mysql -u${dbUser} -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS ${database};"`,
    `cd "${targetPath}" && ${passwordCmd} && sed '/^\\s*SET\\s\\+transaction_timeout\\b/d' "${file}" | docker exec -i ${container} mysql -u${dbUser} -p"$MYSQL_ROOT_PASSWORD" ${database}`
  ];

  for (const step of steps) {
    if (dryRun) {
      console.log(`[dry-run] ssh ${[...sshBaseArgs, remoteHost, step].join(" ")}`);
    } else {
      await runCommand("ssh", [...sshBaseArgs, remoteHost, step]);
    }
  }
}

/** Import a PostgreSQL dump file into a remote postgres-global container via SSH. */
export async function importPgDumpRemote(flags = []) {
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configPath = configFlag ? configFlag.replace("--config=", "") : "deploy/workflow.remote.json";
  const parsed = JSON.parse(await fs.readFile(path.resolve(process.cwd(), configPath), "utf8"));
  const remote = parsed.remote || {};
  const host = String(remote.host || "").trim();
  const userHost = String(remote.user || "").trim();
  const port = String(remote.port || 22).trim();
  const keyPath = expandHome(String(remote.keyPath || "").trim());
  const targetPath = String(remote.targetPath || "").trim();
  const dbImport = parsed.databaseImport || {};
  const file = getOption(flags, "--file", String(dbImport.file || "deploy/nexwire.sql"));
  const database = getOption(flags, "--database", String(dbImport.database || "nexwire"));
  const container = getOption(flags, "--container", String(dbImport.container || "postgres-global"));
  const dbUser = getOption(flags, "--user", String(dbImport.user || "postgres"));
  const passwordFlag = getOption(flags, "--password", "");
  const pgPassCmd = passwordFlag
    ? `PGPASSWORD='${passwordFlag.replace(/'/g, "'\\''")}'`
    : `PGPASSWORD=$(grep '^POSTGRES_PASSWORD=' deploy/server/.env 2>/dev/null | head -1 | cut -d '=' -f2-)`;
  const sshBaseArgs = ["-p", port];
  if (keyPath) sshBaseArgs.push("-i", keyPath);
  const remoteHost = `${userHost}@${host}`;
  const dryRun = hasFlag(flags, "--dry-run");

  const steps = [
    `cd "${targetPath}" && [ -f "${file}" ] || (echo "Missing SQL file: ${file}" && exit 1)`,
    `cd "${targetPath}" && ${pgPassCmd} && export PGPASSWORD && printf '%s\\n' "SELECT 'CREATE DATABASE ${database}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')\\gexec" | docker exec -i -e PGPASSWORD=$PGPASSWORD ${container} psql -U ${dbUser} -d postgres -v ON_ERROR_STOP=1`,
    `cd "${targetPath}" && ${pgPassCmd} && export PGPASSWORD && sed '/^\\s*SET\\s\\+transaction_timeout\\b/d' "${file}" | docker exec -i -e PGPASSWORD=$PGPASSWORD ${container} psql -U ${dbUser} -d ${database}`
  ];

  for (const step of steps) {
    if (dryRun) {
      console.log(`[dry-run] ssh ${[...sshBaseArgs, remoteHost, step].join(" ")}`);
    } else {
      await runCommand("ssh", [...sshBaseArgs, remoteHost, step]);
    }
  }
}

/** Import an SQL dump into the remote container, auto-detecting MySQL vs PostgreSQL. */
export async function importDumpRemote(flags = []) {
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configPath = configFlag ? configFlag.replace("--config=", "") : "deploy/workflow.remote.json";
  let container = "";
  try {
    const parsed = JSON.parse(await fs.readFile(path.resolve(process.cwd(), configPath), "utf8"));
    container = String(parsed.databaseImport?.container || "").toLowerCase();
  } catch {}
  if (!container) container = String(getOption(flags, "--container", "")).toLowerCase();
  if (container.includes("postgres")) return importPgDumpRemote(flags);
  return importMysqlDumpRemote(flags);
}

/** Run a deploy workflow from a config file or inline flags. */
export async function runDeployWorkflow(flags = []) {
  const serverOnly = hasFlag(flags, "--server-only");
  const appOnly = hasFlag(flags, "--app-only");
  const refresh = hasFlag(flags, "--refresh");
  const dryRun = hasFlag(flags, "--dry-run");
  const runtimeFlag = flags.find((flag) => flag.startsWith("--runtime="));
  const pmFlag = flags.find((flag) => flag.startsWith("--pm="));
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configPath = configFlag ? configFlag.replace("--config=", "") : "";
  if (configPath) {
    const parsed = JSON.parse(await fs.readFile(path.resolve(process.cwd(), configPath), "utf8"));
    const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    for (const step of steps) {
      if (step.enabled === false) continue;
      const run = String(step.run || "").trim();
      if (!run) continue;
      const [subcommand, ...subArgs] = run.split(/\s+/).filter(Boolean);
      if (dryRun) {
        console.log(`[dry-run] ${run}`);
        continue;
      }
      const isWorkflowStep = subcommand === "deploy:workflow";
      if (isWorkflowStep && subArgs.includes("--server-only")) await runDeploy("deploy:server");
      else if (isWorkflowStep && subArgs.includes("--app-only")) await runDeploy("deploy:app");
      else if (subcommand === "deploy:server" || subcommand === "deploy:app") await runDeploy(subcommand);
      else if (subcommand === "deploy:db:import") await importDumpLocal(subArgs);
      else if (subcommand === "deploy:init" || subcommand === "deploy:create") await createDeploy(subArgs);
    }
    return;
  }
  if (refresh) await createDeploy(["--force", ...(runtimeFlag ? [runtimeFlag] : []), ...(pmFlag ? [pmFlag] : [])]);
  if (!appOnly && !dryRun) await runDeploy("deploy:server");
  if (!serverOnly && !dryRun) await runDeploy("deploy:app");
}

/** Initialize a local workflow config file. */
export async function initDeployWorkflow() {
  const filePath = path.resolve(process.cwd(), "deploy/workflow.local.json");
  const template = await readStubRaw(STUBS.deploy.workflow.local);
  await writeFileIfMissing(filePath, template);
}

/** Initialize a remote workflow config file. */
export async function initRemoteDeployWorkflow() {
  const filePath = path.resolve(process.cwd(), "deploy/workflow.remote.json");
  const template = await readStubRaw(STUBS.deploy.workflow.remote);
  await writeFileIfMissing(filePath, template);
}

/** Run a remote workflow: upload project files and deploy on remote Docker host. */
export async function runRemoteWorkflow(flags = []) {
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configPath = configFlag ? configFlag.replace("--config=", "") : "deploy/workflow.remote.json";
  const config = await readRemoteConfig(configPath);
  const { sshArgs, remoteHost } = buildSshArgs(config);
  const serverOnly = hasFlag(flags, "--server-only");
  const appOnly = hasFlag(flags, "--app-only");
  const dryRun = hasFlag(flags, "--dry-run");

  console.log("Creating remote target directory...");
  if (dryRun) {
    console.log(`[dry-run] ssh ${[...sshArgs, remoteHost, `mkdir -p "${config.targetPath}"`].join(" ")}`);
  } else {
    await runCommand("ssh", [...sshArgs, remoteHost, `mkdir -p "${config.targetPath}"`]);
  }

  console.log("Uploading project files (excluding node_modules, .git, dist)...");
  if (dryRun) {
    console.log(`[dry-run] upload project to ${config.user}@${config.host}:${config.targetPath}/ (rsync or scp)`);
  } else if (config.rsyncPath) {
    await uploadWithRsync(config, `${config.user}@${config.host}:${config.targetPath}/`);
  } else {
    await uploadWithScp(config, `${config.user}@${config.host}:${config.targetPath}/`);
  }

  if (!appOnly) await runRemoteServer(flags);
  if (!serverOnly) await runRemoteApp(flags);
}

const UPLOAD_EXCLUDED = new Set(["node_modules", ".git", "dist", ".env"]);

/** Upload the project to the remote host using scp (built-in, cross-platform). */
async function uploadWithScp(config, target) {
  const sourceRoot = path.resolve(process.cwd());
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const sshOpts = ["-r", "-P", config.port, config.keyPath ? "-i" : "", config.keyPath || "", config.rsyncSshOptions].filter(Boolean);
  for (const entry of entries) {
    if (UPLOAD_EXCLUDED.has(entry.name)) continue;
    if (entry.name.startsWith(".env")) continue;
    const source = path.join(sourceRoot, entry.name);
    await runCommand("scp", [...sshOpts, source, target]);
  }
}

/** Upload the project to the remote host using rsync (faster incremental sync). */
async function uploadWithRsync(config, target) {
  const source = toRsyncLocalPath(path.resolve(process.cwd()));
  const sshOpts = [
    `-p ${config.port}`,
    config.keyPath ? `-i "${toRsyncSshPath(config.keyPath)}"` : "",
    config.rsyncSshOptions ? toRsyncSshPath(config.rsyncSshOptions) : ""
  ]
    .filter(Boolean)
    .join(" ");
  await runCommand(config.rsyncPath, [
    "-avz",
    "--delete",
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=dist",
    "--exclude=/.env*",
    "-e",
    `"${toRsyncSshPath(config.rsyncSshPath)}" ${sshOpts}`,
    source,
    target
  ]);
}

/** Run a local workflow (delegates to runDeployWorkflow). */
export async function runLocalWorkflow(flags = []) {
  await runDeployWorkflow(flags);
}

/** Promote: run local workflow then remote workflow with appropriate config files. */
export async function runPromoteWorkflow(flags = []) {
  const configFlag = flags.find((flag) => flag.startsWith("--config="));
  const configValue = configFlag ? configFlag.replace("--config=", "") : "";
  const normalized = configValue.toLowerCase();
  const localConfig = !configValue
    ? "deploy/workflow.local.json"
    : normalized.includes("remote")
      ? "deploy/workflow.local.json"
      : configValue;
  const remoteConfig = !configValue
    ? "deploy/workflow.remote.json"
    : normalized.includes("local")
      ? "deploy/workflow.remote.json"
      : configValue;
  const localFlags = [...flags.filter((flag) => !flag.startsWith("--config=")), `--config=${localConfig}`];
  const remoteFlags = [...flags.filter((flag) => flag !== "--refresh" && !flag.startsWith("--config=")), `--config=${remoteConfig}`];
  await runLocalWorkflow(localFlags);
  await runRemoteWorkflow(remoteFlags);
}
