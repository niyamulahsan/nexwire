import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { appConfig, mailConfig, realtimeConfig, redisConfig } from "@/config/index.js";
import { createKernel } from "@/framework/kernel.js";
import { stopQueueRuntime } from "@/framework/queue/queue.js";
import { stopQueueDashboard } from "@/framework/queue/ui.js";
import { broadcast, closeRealtime, initRealtime, WS_PATH } from "@/framework/realtime/index.js";
import { setupSocketAdminUI } from "@/framework/realtime/ui.js";
import { closeRedis, redisClientIfReady, redisError, redisReady } from "@/framework/redis/client.js";
import { isBun } from "@/framework/runtime/runtime.js";
import { type HttpServerHandle, startHttpServer } from "@/framework/runtime/server-adapter.js";
import { parseCsvOrFallback, registerShutdownSignals, type ShutdownSignal } from "@/framework/support/lifecycle.js";
import { logger } from "@/framework/support/logger.js";

const redisBackedServices = "cache, session, queue, events, Queue Dashboard";

/**
 * Why: Builds reliable local URL string for runtime service output.
 * When: Printing API/docs/Queue Dashboard endpoints at startup.
 * Where: Server runtime logging.
 * How: Derives bound port from server address and normalizes hostname.
 */
function serverUrl(server: HttpServerHandle, pathname = "") {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : appConfig.port;

  try {
    const currentUrl = new URL(appConfig.url);
    currentUrl.port = String(port);
    if (currentUrl.hostname === "0.0.0.0" || currentUrl.hostname === "::") {
      currentUrl.hostname = "localhost";
    }

    return `${currentUrl.toString().replace(/\/$/, "")}${pathname}`;
  } catch {
    return `http://localhost:${port}${pathname}`;
  }
}

export interface ServerHandle {
  app: Awaited<ReturnType<typeof createKernel>>["app"];
  bullBoard: Awaited<ReturnType<typeof createKernel>>["bullBoard"];
  server: HttpServerHandle;
  realtime: Awaited<ReturnType<typeof initRealtime>>;
  broadcastSubClient: ReturnType<typeof redisClientIfReady> | null;
  shutdown: (signal: ShutdownSignal) => Promise<void>;
  closeHttpServer: () => Promise<void>;
}

/**
 * Why: Starts the HTTP server and wires realtime/queue/redis shutdown.
 * When: CLI `serve` command or E2E test bootstrap.
 * Where: Server entrypoint.
 * How: Creates kernel, starts HTTP, registers signal handlers, returns handle.
 *      When called as the main module, also prints startup banners.
 */
export async function startServer(): Promise<ServerHandle> {
  const { app, bullBoard } = await createKernel();

  let realtime = null as Awaited<ReturnType<typeof initRealtime>>;
  let server: HttpServerHandle;

  if (isBun()) {
    realtime = await initRealtime({ app });
    server = await startHttpServer(app, appConfig.port, realtime?.websocketServe);
  } else {
    server = await startHttpServer(app, appConfig.port);
    realtime = await initRealtime({ httpServer: server.native });
  }

  const socketAdmin = setupSocketAdminUI(realtime?.io ?? null);

  let shuttingDown = false;
  let broadcastSubClient: ReturnType<typeof redisClientIfReady> | null = null;

  async function closeHttpServer() {
    await server.close();
  }

  async function shutdown(signal: ShutdownSignal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Shutdown signal received", { signal });
    if (broadcastSubClient) {
      try {
        await broadcastSubClient.quit();
      } catch {
        broadcastSubClient.disconnect();
      }
      broadcastSubClient = null;
    }
    await Promise.allSettled([closeRealtime(), stopQueueRuntime(), closeHttpServer()]);
    stopQueueDashboard();
    await closeRedis();

    process.exit(0);
  }

  registerShutdownSignals(shutdown);

  if (redisConfig.enabled && realtime) {
    const redis = redisClientIfReady();
    if (redis) {
      broadcastSubClient = redis.duplicate();
      await broadcastSubClient.connect();
      const channel = `${redisConfig.prefix}:broadcast`;
      await broadcastSubClient.subscribe(channel);
      broadcastSubClient.on("message", (_channel: string, message: string) => {
        try {
          const { event, payload, options } = JSON.parse(message);
          if (event) broadcast(event, payload, options);
        } catch (error) {
          logger.error("Broadcast relay error", { error });
        }
      });
    }
  }

  const views = new Set(parseCsvOrFallback(process.env.NEXWIRE_DEV_VIEWS, []).map((view) => view.toLowerCase()));
  let redisWarnColor: ((text: string) => string) | null = null;
  console.log(`API Docs: ${serverUrl(server, "/api-docs")}`);

  if (appConfig.uiEnabled) {
    if (process.env.NEXWIRE_FRONTEND_URL) {
      console.log(`UI: ${process.env.NEXWIRE_FRONTEND_URL}`);
    } else {
      console.log("UI enabled");
    }
  } else {
    console.log(chalk.gray("UI disabled (disabled in src/config/app.ts)"));
  }

  const bullboardLine = `${bullBoard.enabled ? "Queue Dashboard enabled" : "Queue Dashboard unavailable"}: ${serverUrl(server, bullBoard.basePath)}`;
  console.log(redisWarnColor ? redisWarnColor(bullboardLine) : bullboardLine);

  if (views.has("maildev")) {
    const maildevLine = `MailDev: http://localhost:${mailConfig.maildev.webPort} (SMTP ${mailConfig.maildev.smtpPort})`;
    const line = `${maildevLine} (requested; see dev process status)`;
    console.log(redisWarnColor ? redisWarnColor(line) : line);
  }

  if (views.has("studio")) {
    console.log("Drizzle Studio requested: https://local.drizzle.studio (see dev process status)");
  }

  const socketLine = !realtimeConfig.enabled
    ? "Realtime (Socket.IO) disabled"
    : realtime
      ? `Realtime (Socket.IO) enabled: ${socketAdmin.enabled ? "Admin UI: https://admin.socket.io" : ""} ${"| " + serverUrl(server, WS_PATH).replace(/^http/, "ws")}`
      : "Realtime (Socket.IO) unavailable";
  console.log(!realtimeConfig.enabled ? chalk.gray(socketLine) : realtime ? chalk.green(socketLine) : chalk.yellow(socketLine));

  if (views.has("redis")) {
    const redisUiLine = `Redis UI: http://localhost:${redisConfig.commanderPort}`;
    const line = `${redisUiLine} (requested; see dev process status)`;
    console.log(redisWarnColor ? redisWarnColor(line) : line);
  }

  if (!redisConfig.enabled) {
    redisWarnColor = chalk.cyan;
    console.log(chalk.cyan("Redis disabled (configured in src/config/redis.ts)"));
    console.log(chalk.cyan(`Redis-backed services disabled: ${redisBackedServices}`));
  } else if (redisReady()) {
    console.log(chalk.green(`Redis connected: ${redisConfig.url}`));
    console.log(chalk.green(`Redis-backed services enabled: ${redisBackedServices}`));
  } else {
    redisWarnColor = chalk.yellow;
    console.log(chalk.yellow(`Redis unavailable: ${redisError() || "not connected"}`));
    console.log(chalk.yellow(`Redis-backed services unavailable: ${redisBackedServices}`));
  }

  console.log(`${appConfig.name} API running on ${serverUrl(server)}`);

  return { app, bullBoard, server, realtime, broadcastSubClient, shutdown, closeHttpServer };
}

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile);
if (isMain) {
  await startServer();
}
