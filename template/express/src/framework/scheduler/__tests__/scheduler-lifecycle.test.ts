import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle for scheduler.ts.
 *
 * The interesting bug class: cron jobs that fire while a previous tick
 * is still running. The `runWithLock` wrapper prevents that, but only
 * if the scheduler wires it correctly. If it doesn't, a slow job overlaps
 * with itself, double-processing the same work.
 */

const state = vi.hoisted(() => ({
  cronJobs: [] as Array<{ handler: () => void | Promise<void> }>,
  runWithLockCalled: false,
}));

vi.mock("croner", () => ({
  Cron: class {
    constructor(_expr: string, _opts: any, handler: () => void | Promise<void>) {
      state.cronJobs.push({ handler });
    }
    stop() {}
  },
}));

vi.mock("@/framework/modules/discover.js", () => ({
  discoverModuleFiles: vi.fn(async () => []),
  importFile: vi.fn(async () => {}),
}));

vi.mock("@/framework/queue/queue.js", () => ({
  getQueue: vi.fn(() => null),
}));

vi.mock("@/framework/scheduler/lock.js", () => ({
  runWithLock: vi.fn(async (_name: string, fn: () => Promise<void>) => {
    state.runWithLockCalled = true;
    await fn();
  }),
}));

async function loadScheduler() {
  vi.resetModules();
  return import("@/framework/scheduler/scheduler.js");
}

beforeEach(() => {
  state.cronJobs.length = 0;
  state.runWithLockCalled = false;
});

describe("scheduler tick overlap prevention", () => {
  it("cron handler delegates to runWithLock", async () => {
    const { defineSchedule, startScheduler } = await loadScheduler();
    defineSchedule({ name: "test-job", expression: "* * * * *", handler: async () => {} });
    await startScheduler();
    expect(state.runWithLockCalled).toBe(false); // not called yet
    await state.cronJobs[0].handler();
    expect(state.runWithLockCalled).toBe(true);
  });
});
