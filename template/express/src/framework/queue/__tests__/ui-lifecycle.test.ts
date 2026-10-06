import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle for queue/ui.ts.
 *
 * The failure mode: `setupQueueDashboard` starts a `setInterval( refreshDashboardQueues, 5000 )`.
 * If the HTTP kernel reboots the dashboard (or a supervisor restart in-process)
 * without calling `stopQueueDashboard()` first, the old interval keeps running.
 * Each boot adds one more interval, each of which scans Redis every 5 seconds.
 * After ten reboots, ten intervals fire; Redis sees ten times the expected
 * SCAN load, and `refreshDashboardQueues` runs concurrently, which the
 * `syncInFlight` guard prevents except by serializing them — so they queue up
 * and the event loop stalls.
 */

const state = vi.hoisted(() => ({
  timers: 0,
  intervals: [] as Array<ReturnType<typeof setInterval>>,
  redisReady: false,
  redisScanResult: [] as string[],
  logs: [] as string[],
}));

vi.mock("@/config/index.js", () => ({
  get queueConfig() {
    return { queueUi: "/queues", prefix: "nexwire:queue", allowedEmails: [] };
  },
  get redisConfig() {
    return { url: "redis://localhost:6379" };
  },
}));

vi.mock("@/framework/queue/queue.js", () => ({
  ensureQueues: vi.fn(),
  getQueue: vi.fn(() => null),
}));

vi.mock("@/framework/redis/client.js", () => ({
  redisClientIfReady: () =>
    state.redisReady
      ? {
          scan: vi.fn(async () => ["0", state.redisScanResult]),
        }
      : null,
}));

vi.mock("@/framework/support/cookie.js", () => ({ cookie: { getAuth: vi.fn(async () => null) } }));
vi.mock("@/framework/support/jwt.js", () => ({ jwt: { verifyToken: vi.fn(async () => null) } }));
vi.mock("@/framework/support/lifecycle.js", () => ({ parseCsvOrFallback: (s: string, fb: string[]) => fb }));

vi.mock("@bull-board/api", () => ({
  createBullBoard: vi.fn(() => ({
    addQueue: vi.fn(),
    removeQueue: vi.fn(),
  })),
}));
vi.mock("@bull-board/api/bullMQAdapter", () => ({ BullMQAdapter: vi.fn() }));
vi.mock("@bull-board/hono", () => ({
  HonoAdapter: class {
    setBasePath = vi.fn();
    registerPlugin = vi.fn(() => ({}));
  },
}));
vi.mock("@hono/node-server/serve-static", () => ({ serveStatic: vi.fn() }));

beforeEach(() => {
  state.timers = 0;
  state.intervals.length = 0;
  state.redisReady = false;
  state.redisScanResult = [];
  state.logs.length = 0;
  // Track setInterval to prove the interval is the leak shape
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  globalThis.setInterval = vi.fn((fn: any, ms: any) => {
    const id = originalSet(fn, ms);
    state.intervals.push(id);
    state.timers++;
    return id;
  }) as any;
  globalThis.clearInterval = vi.fn((id: any) => {
    const i = state.intervals.indexOf(id);
    if (i >= 0) state.intervals.splice(i, 1);
    originalClear(id);
  }) as any;
  return () => {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
  };
});

async function loadUi() {
  vi.resetModules();
  return import("@/framework/queue/ui.js");
}

describe("setupQueueDashboard", () => {
  it("starts the poll interval", async () => {
    state.redisReady = true;
    const { setupQueueDashboard } = await loadUi();
    await setupQueueDashboard();
    expect(state.timers).toBe(1);
  });

  it("does not start the interval when Redis is unavailable", async () => {
    const { setupQueueDashboard } = await loadUi();
    await setupQueueDashboard();
    expect(state.timers).toBe(0);
  });
});

describe("stopQueueDashboard clears the interval", () => {
  it("clears the interval so no scans happen on a stopped dashboard", async () => {
    state.redisReady = true;
    const { setupQueueDashboard, stopQueueDashboard } = await loadUi();
    await setupQueueDashboard();
    stopQueueDashboard();
    expect(state.intervals).toHaveLength(0);
  });

  it("is safe to call twice", async () => {
    state.redisReady = true;
    const { setupQueueDashboard, stopQueueDashboard } = await loadUi();
    await setupQueueDashboard();
    stopQueueDashboard();
    expect(() => stopQueueDashboard()).not.toThrow();
  });

  it("is safe when no interval was ever started", async () => {
    const { stopQueueDashboard } = await loadUi();
    expect(() => stopQueueDashboard()).not.toThrow();
  });
});

describe("restart safety", () => {
  it("setup → stop → setup → stop leaves one interval, not two", async () => {
    state.redisReady = true;
    const { setupQueueDashboard, stopQueueDashboard } = await loadUi();

    await setupQueueDashboard();
    stopQueueDashboard();

    await setupQueueDashboard();
    stopQueueDashboard();

    expect(state.intervals).toHaveLength(0);
  });

  it("does not double the interval when setup is called twice (guarded by pollTimer)", async () => {
    state.redisReady = true;
    const { setupQueueDashboard } = await loadUi();

    await setupQueueDashboard();
    await setupQueueDashboard();

    // Guarded by the module-level pollTimer — one interval, not two.
    expect(state.timers).toBe(1);
  });
});