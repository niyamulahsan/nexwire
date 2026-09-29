import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { NextFunction, Request, Response } from "express";
import { queueConfig, redisConfig } from "@/config/index.js";
import { ensureQueues, getQueue } from "@/framework/queue/queue.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { cookie } from "@/framework/support/cookie.js";
import { jwt } from "@/framework/support/jwt.js";
import { parseCsvOrFallback } from "@/framework/support/lifecycle.js";

const BASE_PATH = queueConfig.queueUi || "/queues";

const POLL_INTERVAL_MS = 5_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let boardApp: any | null = null;
let syncInFlight = false;

const dashboardQueueNames = new Set<string>();

const serverAdapter = new ExpressAdapter();
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

function dashboardAuth() {
  const allowedEmails = allowedQueueDashboardEmails();

  return async (req: Request, res: Response, next: NextFunction) => {
    /**
     * Why: The email allowlist is the ONLY gate on the queue dashboard UI.
     * When: No `allowedEmails` configured → the dashboard is open to everyone
     *      in both dev and production (no login required). When configured,
     *      only the listed email(s) pass — everyone else is blocked.
     * Where: BullMQ dashboard route middleware.
     * How: An empty allowlist short-circuits straight through; otherwise the
     *      requester's email (from the validated access token) must be in the
     *      set. This keeps BullMQ workers (mail delivery etc.) always running
     *      and gating strictly UI-only.
     */
    if (allowedEmails.size === 0) {
      return next();
    }

    const rawToken = await cookie.getAuth(req);
    if (!rawToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = await jwt.verifyToken(rawToken, "access");
    if (!payload) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const normalized = payload as Record<string, unknown>;
    const email = String(normalized.email ?? "")
      .trim()
      .toLowerCase();

    if (!allowedEmails.has(email)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return next();
  };
}

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

export async function setupQueueDashboard() {
  if (!redisClientIfReady()) {
    const route = (app: any) => {
      app.get(BASE_PATH, (_req: Request, res: Response) => res.status(200).send(unavailableHtml()));
      app.get(new RegExp(`^${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.*$`), (_req: Request, res: Response) => res.redirect(BASE_PATH));
    };

    return { basePath: BASE_PATH, enabled: false, route };
  }

  boardApp = serverAdapter.getRouter();

  await refreshDashboardQueues();
  if (!pollTimer) {
    pollTimer = setInterval(refreshDashboardQueues, POLL_INTERVAL_MS);
  }

  const route = (app: any) => {
    app.use(BASE_PATH, dashboardAuth(), boardApp);
  };

  return { basePath: BASE_PATH, enabled: true, route };
}
