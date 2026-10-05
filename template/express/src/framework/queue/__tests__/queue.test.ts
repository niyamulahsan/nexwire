import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueJob } from "../queue.js";

/**
 * Redis being absent is the default in a freshly scaffolded project - the
 * shipped `.env` has REDIS=false. So "Redis is not available" is the common
 * case, not an edge case, and `queueJob` returning null is what almost every
 * caller sees first.
 *
 * That return used to be completely silent. A caller doing
 * `await dispatchEvent("orders.exported", data, { queue: true })` got back
 * null, saw no output, and had no way to learn that the job was never queued
 * and therefore never ran. The work was simply gone.
 *
 * These tests pin the failure being reported, and reported once per job so a
 * hot path cannot flood the log.
 */

vi.mock("@/framework/redis/client.js", () => ({
  redisClientIfReady: () => null
}));

describe("queueJob when Redis is unavailable", () => {
  let warnings: string[] = [];

  beforeEach(() => {
    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
  });

  it("reports the dropped job instead of discarding it silently", async () => {
    const result = await queueJob("invoices.export", { id: 7 }, { queue: "reports" });

    // Still null - there is nowhere to put the job. That part cannot change.
    expect(result).toBeNull();

    // But it is no longer silent, and the message has to be enough to act on
    // without opening the framework source.
    expect(warnings).toHaveLength(1);
    const message = warnings[0];
    expect(message).toContain("invoices.export"); // which job vanished
    expect(message).toContain("reports"); // which queue it was meant for
    expect(message).toContain("Redis"); // why
    expect(message).toContain(".env"); // where to turn it on
  });

  it("tells the caller there is a Redis-free way to run the work now", async () => {
    await queueJob("reports.nightly-rollup", {}, { queue: "reports" });
    // A developer reading only the warning should learn the fallback, not just
    // the failure. dispatchCommand without { async: true } runs in-process.
    expect(warnings[0]).toContain("dispatchCommand");
  });

  it("warns once per job so a hot path cannot flood the log", async () => {
    // A handler on a request path can call this hundreds of times a minute.
    // One line per call would bury every other warning in the log.
    for (let i = 0; i < 25; i++) {
      await queueJob("cart.recalculate", { i }, { queue: "default" });
    }
    expect(warnings).toHaveLength(1);
  });

  it("still reports a different job on the same queue", async () => {
    // De-duplication must not silence a genuinely separate failure.
    await queueJob("orders.export", {}, { queue: "reports" });
    await queueJob("orders.import", {}, { queue: "reports" });
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain("orders.import");
  });

  it("does not confuse two queues that run the same job name", async () => {
    // The identity of a queued job is queue + name, not name alone.
    await queueJob("generate-pdf", {}, { queue: "reports" });
    await queueJob("generate-pdf", {}, { queue: "mail" });
    expect(warnings).toHaveLength(2);
  });

  it("honours an explicit delay in the report, since it was never scheduled", async () => {
    await queueJob("reminders.send", {}, { queue: "mail", delay: 60 });
    expect(warnings[0]).toContain("60");
  });
});
