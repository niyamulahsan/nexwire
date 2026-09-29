import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, Next } from "hono";
import { queueConfig, redisConfig } from "@/config/index.js";
import { ensureQueues, getQueue } from "@/framework/queue/queue.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { cookie } from "@/framework/support/cookie.js";
import { jwt } from "@/framework/support/jwt.js";
import { parseCsvOrFallback } from "@/framework/support/lifecycle.js";

const BASE_PATH = queueConfig.queueUi || "/queues";

const POLL_INTERVAL_MS = 5_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let boardApp: ReturnType<typeof serverAdapter.registerPlugin> | null = null;
let syncInFlight = false;

const dashboardQueueNames = new Set<string>();

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath(BASE_PATH);

const bullBoard = createBullBoard({
  queues: [],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: "Queue Dashboard"
    }
  }
});

export function stopQueueDashboard() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Why: Keeps the dashboard queue list in sync with queues that actually exist
 *      in Redis (including ones created after boot, e.g. `demo`).
 * When: Dashboard setup and on an interval while the server runs.
 * Where: Queue dashboard bootstrap.
 * How: Scans BullMQ `:meta` keys for queue names, materializes Queue objects,
 *      and adds/removes their bull-board adapters as queues appear or vanish.
 */
async function refreshDashboardQueues() {
  if (syncInFlight) return;
  syncInFlight = true;

  try {
    const client = redisClientIfReady();
    if (!client) return;

    const discovered = (await discoverQueueNames()).sort();
    ensureQueues(discovered);

    for (const name of discovered) {
      if (dashboardQueueNames.has(name)) continue;
      const queue = getQueue(name);
      if (!queue) continue;
      bullBoard.addQueue(new BullMQAdapter(queue));
      dashboardQueueNames.add(name);
    }

    for (const name of Array.from(dashboardQueueNames)) {
      if (!discovered.includes(name)) {
        bullBoard.removeQueue(name);
        dashboardQueueNames.delete(name);
      }
    }
  } catch {
    // Keep the previous queue list if a refresh fails.
  } finally {
    syncInFlight = false;
  }
}

function queuePrefix() {
  return queueConfig.prefix;
}

function allowedQueueDashboardEmails() {
  const emails = parseCsvOrFallback(queueConfig.allowedEmails, []);
  return new Set(emails.map((email) => email.toLowerCase()));
}

/**
 * Why: Builds the dashboard auth hook from the app's access-token cookie.
 * When: Every `/admin/queues` request needs authorization.
 * Where: Queue dashboard bootstrap.
 * How: Reads the signed access cookie through the framework cookie helper,
 *      verifies the JWT, and applies the email allow-list; unauthorized
 *      requests get a 401 JSON response.
 */
function dashboardAuth() {
  const allowedEmails = allowedQueueDashboardEmails();

  return async (c: Context, next: Next) => {
    /**
     * Why: The email allowlist is the ONLY gate on the BullMQ dashboard.
     * When: No `allowedEmails` configured → the dashboard is open to everyone
     *      in both dev and production (no login required). When configured,
     *      only the listed email(s) pass — everyone else is blocked.
     * Where: BullMQ dashboard route middleware.
     * How: An empty allowlist short-circuits straight through; otherwise the
     *      requester's email (from the verified access token) must be in the
     *      set. BullMQ worker/mail delivery always runs regardless — this
     *      gate never touches the worker, only the UI.
     */
    if (allowedEmails.size === 0) {
      return next();
    }

    const rawToken = await cookie.getAuth(c);
    if (!rawToken) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    const payload = await jwt.verifyToken(rawToken, "access");
    if (!payload) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    const normalized = payload as Record<string, unknown>;
    const email = String(normalized.email ?? "")
      .trim()
      .toLowerCase();

    if (!allowedEmails.has(email)) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    await next();
  };
}

/** Why: Discovers all BullMQ queues in Redis by scanning queue:meta keys. */
async function discoverQueueNames(): Promise<string[]> {
  const client = redisClientIfReady();
  if (!client) return [];

  const prefix = `${queuePrefix()}:`;
  const names = new Set<string>();
  let cursor = 0;

  do {
    const [nextCursor, keys] = await client.scan(cursor, "MATCH", `${prefix}*:meta`, "COUNT", 100);
    cursor = Number(nextCursor);
    for (const key of keys) {
      const name = key.slice(prefix.length, -5);
      if (name) names.add(name);
    }
  } while (cursor !== 0);

  return Array.from(names);
}

function unavailableHtml() {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Queue Dashboard Unavailable</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 48px; text-align: center; }
          h1 { color: #dc2626; }
        </style>
      </head>
      <body>
        <h1>Queue Dashboard Unavailable</h1>
        <p>Redis is not connected. Check the Redis URL in src/config/redis.ts and make sure Redis is running.</p>
        <p>Redis URL: ${redisConfig.url}</p>
      </body>
    </html>
  `;
}

/**
 * Why: Initializes the bull-board dashboard (Hono adapter) with auth protection.
 * When: HTTP kernel boots queue UI integration.
 * Where: Kernel startup and `/admin/queues` route mounting.
 * How: Builds the bull-board Hono plugin from the shared Redis connection and
 *      mounts it behind the access-token auth middleware; returns an
 *      unavailable page when Redis is down.
 */
export async function setupQueueDashboard() {
  if (!redisClientIfReady()) {
    const route = (app: any) => {
      app.get(BASE_PATH, (c: any) => c.html(unavailableHtml()));
      app.get(`${BASE_PATH}/*`, (c: any) => c.redirect(BASE_PATH));
    };

    return { basePath: BASE_PATH, enabled: false, route };
  }

  boardApp = serverAdapter.registerPlugin();

  await refreshDashboardQueues();
  if (!pollTimer) {
    pollTimer = setInterval(refreshDashboardQueues, POLL_INTERVAL_MS);
  }

  const route = (app: any) => {
    app.use(`${BASE_PATH}/*`, dashboardAuth());
    app.route(BASE_PATH, boardApp!);
  };

  return { basePath: BASE_PATH, enabled: true, route };
}
