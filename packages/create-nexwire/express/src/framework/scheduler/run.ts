import { initDatabase } from "@/framework/database/connection.js";
import { bootQueueJobs, stopQueueRuntime } from "@/framework/queue/queue.js";
import { closeRedis, initRedis } from "@/framework/redis/client.js";
import { startScheduler, stopScheduler } from "@/framework/scheduler/scheduler.js";
import { registerShutdownSignals, type ShutdownSignal } from "@/framework/support/lifecycle.js";
import { logger } from "@/framework/support/logger.js";

export interface SchedulerHandle {
  count: number;
  shutdown: (signal: ShutdownSignal) => Promise<void>;
}

/**
 * Why: Starts the scheduler and wires DB/Redis/queue shutdown.
 * When: CLI `schedule:work` command or E2E test bootstrap.
 * Where: Scheduler entrypoint.
 * How: Inits DB/Redis, boots queue jobs, starts scheduler, registers signals.
 *      When called as the main module, also prints the startup banner.
 */
export async function startSchedulerRuntime(): Promise<SchedulerHandle> {
  await initDatabase();
  await initRedis();
  await bootQueueJobs();
  const count = await startScheduler();
  console.log(`Scheduler started [${count} schedule(s)]`);

  let shuttingDown = false;

  async function shutdown(signal: ShutdownSignal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Scheduler shutdown signal received", { signal });
    await Promise.allSettled([Promise.resolve(stopScheduler()), stopQueueRuntime()]);
    await closeRedis();

    process.exit(0);
  }

  registerShutdownSignals(shutdown);

  return { count, shutdown };
}

const isMain = process.argv[1]?.endsWith("run.ts") || process.argv[1]?.endsWith("run.js");
if (isMain) {
  await startSchedulerRuntime();
}