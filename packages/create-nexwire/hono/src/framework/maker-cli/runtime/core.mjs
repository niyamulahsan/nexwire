import { spawn, spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import { readCliConfig } from "../utils/env-config.mjs";
import { getOption, hasFlag } from "../utils/flags.mjs";
import { localBin, packageScript, runCommand, runNodeScript } from "../utils/process.mjs";

/** Parse --with/--view/--viewer flags to determine which dev tools to launch.
 *  npm swallows --view/--with into its own config and re-exposes them as
 *  npm_config_viewer/npm_config_with env vars, so read those too. */
function parseWithOptions(flags = []) {
  const supported = new Set(["redis", "maildev", "studio"]);
  const selected = new Set();

  const candidates = [
    getOption(flags, "--with"),
    getOption(flags, "--view"),
    getOption(flags, "--viewer"),
    process.env.npm_config_with,
    process.env.npm_config_view,
    process.env.npm_config_viewer
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    for (const item of raw.split(/[,\s]+/)) {
      const key = item.trim().toLowerCase();
      if (!key) continue;

      if (!supported.has(key)) {
        console.warn(`[dev] Unknown --with option '${key}' (supported: redis, maildev, studio)`);
        continue;
      }

      selected.add(key);
    }
  }

  return selected;
}

/** Build a list of dev UI tools to launch based on flags and with-options. */
function devViewList(flags = [], withOptions = new Set()) {
  const selected = new Set(withOptions);
  if (hasFlag(flags, "--with-redis-view")) selected.add("redis");
  if (hasFlag(flags, "--with-maildev")) selected.add("maildev");
  if (hasFlag(flags, "--with-db-studio")) selected.add("studio");
  return Array.from(selected);
}

/** Build redis-commander CLI arguments from REDIS_URL env. */
function redisConnectionArgs() {
  const redisUrl = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  const result = [
    "--port",
    String(readCliConfig().commanderPort || process.env.REDIS_COMMANDER_PORT || "1369"),
    "--redis-host",
    redisUrl.hostname || "127.0.0.1",
    "--redis-port",
    redisUrl.port || "6379"
  ];

  if (redisUrl.password) result.push("--redis-password", decodeURIComponent(redisUrl.password));
  return result;
}

/** Poll the API health endpoint until it responds or retries exhausted. */
async function waitForHealth(url, maxRetries = 240, intervalMs = 500) {
  let warned = false;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    if (!warned) {
      warned = true;
      console.log(`Waiting for API health (${url})...`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`API health-check failed after ${maxRetries} attempts (${url})`);
}

/** Wait for the API to be reachable before launching the Vite dev server.
 *  Why: the UI boots with /api/auth/me and socket.io requests immediately;
 *  if the backend is not up yet the browser logs ws and API errors. Applies to
 *  ui:dev/admin:dev started on their own (bun run dev already waits for
 *  health before spawning the UI). Set SKIP_BACKEND_WAIT=1 to disable. */
export async function waitForBackendIfNeeded() {
  if (process.env.SKIP_BACKEND_WAIT === "1") return;
  const healthUrl = `${process.env.APP_URL || "http://localhost:3000"}/health`;
  await waitForHealth(healthUrl);
}

/** Run the full dev stack: API, UI, queue worker, and optional UI tools. */
async function runDevStack(flags = []) {
  const cliConfig = readCliConfig();
  const commands = [{ label: "api", args: ["serve", "--src"], required: true, hint: "http://localhost:3000" }];

  if (process.env.UI !== "false" && process.env.UI !== "0") {
    commands.push({
      label: "UI",
      args: ["ui:dev"],
      required: true,
      hint: "http://localhost:5173"
    });
  }

  if (process.env.REDIS !== "false" && process.env.REDIS !== "0") {
    commands.push({
      label: "queue-worker",
      args: ["queue:work"],
      required: false,
      hint: "BullMQ worker"
    });
  }

  const withOptions = parseWithOptions(flags);
  const views = devViewList(flags, withOptions);
  const enableRedisView =
    process.env.REDIS !== "false" && process.env.REDIS !== "0" && (hasFlag(flags, "--with-redis-view") || withOptions.has("redis"));
  const enableMaildev = hasFlag(flags, "--with-maildev") || withOptions.has("maildev");
  const enableDbStudio = hasFlag(flags, "--with-db-studio") || withOptions.has("studio");

  if (enableRedisView) {
    commands.push({
      label: "redis-view",
      args: ["redis:view", "--quiet"],
      required: false,
      hint: `http://localhost:${cliConfig.commanderPort || 1369}`
    });
  }
  if (enableMaildev) {
    commands.push({
      label: "maildev-view",
      args: ["maildev:view", "--quiet"],
      required: false,
      hint: `http://localhost:${cliConfig.maildev?.webPort || 1080}`
    });
  }
  if (enableDbStudio) {
    commands.push({
      label: "db-studio",
      args: ["db:studio", "--quiet"],
      required: false,
      hint: "https://local.drizzle.studio"
    });
  }

  const children = [];
  let shuttingDown = false;
  let settled = false;

  const killTree = (child) => {
    if (!child || child.killed) return;
    try {
      if (process.platform === "win32" && child.pid) {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    } catch {}
  };

  const killAll = () => {
    for (const child of children) killTree(child);
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    killAll();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const apiCmd = commands.find((c) => c.label === "api");
  const rest = commands.filter((c) => c.label !== "api");

  await new Promise((resolve, reject) => {
    const handleChildExit = (child, command) => {
      child.on("exit", (code, signal) => {
        if (settled) return;
        if (!shuttingDown && (code !== null || signal !== null)) {
          if (command.required) {
            settled = true;
            shutdown();
            reject(new Error(`${command.label} exited (${signal || code})`));
            return;
          }
          if (code !== 0 || signal) {
            console.warn(`[dev] Optional process '${command.label}' exited (${signal || code}); continuing`);
          }
        }

        const allExited = children.every((item) => item.exitCode !== null || item.signalCode !== null);
        if (allExited) {
          settled = true;
          resolve();
        }
      });
    };

    const run = async () => {
      const apiChild = spawn(process.execPath, [process.argv[1], ...apiCmd.args], {
        stdio: "inherit",
        env: {
          ...process.env,
          NEXWIRE_DEV_VIEWS: views.join(","),
          NEXWIRE_FRONTEND_URL: "http://localhost:5173"
        }
      });
      children.push(apiChild);

      handleChildExit(apiChild, apiCmd);
      apiChild.on("error", (error) => {
        if (settled) return;
        settled = true;
        shutdown();
        reject(error);
      });

      try {
        await waitForHealth("http://localhost:3000/health");
      } catch (err) {
        settled = true;
        shutdown();
        reject(err);
        return;
      }

      for (const command of rest) {
        const child = spawn(process.execPath, [process.argv[1], ...command.args], {
          stdio: command.label === "queue-worker" ? "inherit" : ["ignore", "ignore", "inherit"],
          env: { ...process.env }
        });
        children.push(child);

        handleChildExit(child, command);

        child.on("error", (error) => {
          if (settled) return;
          settled = true;
          shutdown();
          reject(error);
        });
      }
    };

    run();
  }).finally(() => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    killAll();
  });
}

/** Build the runtime-appropriate command/args for a built dist entrypoint. */
function runtimeEntryCommand(runtime, entry, runtimeArgs = []) {
  if (runtime === "bun") return { command: "bun", args: [entry, ...runtimeArgs] };
  return { command: process.execPath, args: [entry, ...runtimeArgs] };
}

/** Run a runtime command: dev, serve, queue:work, queue:clear, schedule:work. */
export async function runRuntime(commandName, rawArgs = []) {
  const prod = rawArgs.includes("--prod");
  const forceSrc = rawArgs.includes("--src");
  const watch = rawArgs.includes("--watch");
  const runtimeArg = rawArgs.find((arg) => arg.startsWith("--runtime="));
  const runtime = runtimeArg ? runtimeArg.split("=")[1].trim().toLowerCase() : "node";

  if (!["node", "bun"].includes(runtime)) {
    throw new Error(`Invalid runtime '${runtime}'. Supported values: node, bun`);
  }

  const runtimeArgs = rawArgs.filter((arg, i) => i > 0 && !arg.startsWith("--runtime=") && arg !== "--prod" && arg !== "--src");
  const hasDistServer = fsSync.existsSync(path.resolve(process.cwd(), "dist/src/framework/server.js"));
  const hasDistWorker = fsSync.existsSync(path.resolve(process.cwd(), "dist/src/framework/queue/worker.js"));
  const hasDistScheduler = fsSync.existsSync(path.resolve(process.cwd(), "dist/src/framework/scheduler/run.js"));

  if (commandName === "dev") {
    await runDevStack(rawArgs.slice(1));
    return;
  }

  if (commandName === "serve") {
    if (!forceSrc && (prod || hasDistServer)) {
      const entry = path.resolve(process.cwd(), "dist/src/framework/server.js");
      const { command, args } = runtimeEntryCommand(runtime, entry, runtimeArgs);
      await runCommand(command, args);
      return;
    }

    const useWatch = watch || (!prod && forceSrc);
    const tsxWatchIgnore = [
      "--include",
      "src/**/*.ts",
      "--include",
      "src/framework/maker-cli/**/*.mjs",
      "--exclude",
      "src/storage/**",
      "--exclude",
      "src/storage/logs/**",
      "--exclude",
      "src/storage/tmp/**",
      "--exclude",
      "src/database/migrations/**",
      "--exclude",
      "src/database/schema.ts",
      "--exclude",
      "public/**",
      "--exclude",
      "dist/**",
      "--exclude",
      ".git/**",
      "--exclude",
      "node_modules/**",
      "--exclude",
      "**/.DS_Store",
      "--exclude",
      "**/Thumbs.db",
      "--exclude",
      "**/*.log"
    ];
    const tsxArgs = useWatch
      ? ["watch", ...tsxWatchIgnore, "src/framework/server.ts", ...runtimeArgs]
      : ["src/framework/server.ts", ...runtimeArgs];
    await runCommand(localBin("tsx"), tsxArgs);
    return;
  }

  if (commandName === "queue:work") {
    if (!forceSrc && (prod || hasDistWorker)) {
      const entry = path.resolve(process.cwd(), "dist/src/framework/queue/worker.js");
      const { command, args } = runtimeEntryCommand(runtime, entry, runtimeArgs);
      await runCommand(command, args);
      return;
    }

    await runNodeScript(packageScript("tsx", "dist/cli.mjs"), ["src/framework/queue/worker.ts", ...rawArgs.slice(1)]);
    return;
  }

  if (commandName === "queue:clear") {
    await runNodeScript(packageScript("tsx", "dist/cli.mjs"), ["src/framework/queue/clear.ts"]);
    return;
  }

  if (commandName === "schedule:work") {
    if (!forceSrc && (prod || hasDistScheduler)) {
      const entry = path.resolve(process.cwd(), "dist/src/framework/scheduler/run.js");
      const { command, args } = runtimeEntryCommand(runtime, entry, runtimeArgs);
      await runCommand(command, args);
      return;
    }

    await runNodeScript(packageScript("tsx", "dist/cli.mjs"), ["src/framework/scheduler/run.ts", ...rawArgs.slice(1)]);
  }
}

/** Launch a UI tool: maildev or redis-commander. */
export async function runUi(commandName) {
  if (commandName === "maildev:view") {
    const maildev = readCliConfig().maildev || {};
    await runCommand(localBin("maildev"), [
      "--smtp",
      String(maildev.smtpPort || process.env.MAIL_PORT || process.env.MAILDEV_SMTP_PORT || "1025"),
      "--web",
      String(maildev.webPort || process.env.MAILDEV_WEB_PORT || "1080")
    ]);
    return;
  }

  if (commandName === "redis:view") {
    const patch = fileURLToPath(new URL("./redis-commander-patch.cjs", import.meta.url));
    await runCommand(process.execPath, [
      "--require",
      patch,
      packageScript("redis-commander", "bin/redis-commander.js"),
      ...redisConnectionArgs()
    ]);
    return;
  }
}

/** Start Vite dev server for a specific config file. */
export async function runVite(configPath) {
  await waitForBackendIfNeeded();
  await runCommand(localBin("vite"), ["--config", configPath]);
}

/** Run Vitest tests (backend). */
export async function runTest(rawArgs = []) {
  await runCommand(localBin("vitest"), rawArgs);
}

/** Run Vitest in watch mode (backend). */
export async function runTestWatch(rawArgs = []) {
  await runCommand(localBin("vitest"), rawArgs);
}

/** Run Vitest with coverage (backend). */
export async function runTestCoverage(rawArgs = []) {
  await runCommand(localBin("vitest"), ["--coverage", ...rawArgs]);
}

/** Run Vitest in UI mode (backend). */
export async function runTestUI(rawArgs = []) {
  await runCommand(localBin("vitest"), ["--ui", ...rawArgs]);
}

/** Clear Vite cache directories. */
export async function clearViteCache() {
  const dirs = [path.resolve(process.cwd(), "node_modules/.vite"), path.resolve(process.cwd(), "src/resources/node_modules/.vite")];

  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const strayCaches = await glob("**/.vite", {
    cwd: process.cwd(),
    nodir: false,
    ignore: ["**/node_modules/**/.vite/**", "**/.git/**"],
    windowsPathsNoEscape: true
  });

  for (const rel of strayCaches) {
    const fullPath = path.resolve(process.cwd(), rel);
    await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
  }

  console.log("Vite cache cleared.");
}

