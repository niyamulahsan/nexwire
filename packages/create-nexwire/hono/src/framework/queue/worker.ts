import { queueConfig } from "@/config/index.js";
import { closeDatabase, initDatabase } from "@/framework/database/connection.js";
import { pruneStaleQueues, startQueueWorker as startQueueWorkers, stopQueueRuntime } from "@/framework/queue/queue.js";
import { closeRedis, initRedis, redisError, redisReady } from "@/framework/redis/client.js";
import { parseCsvOrFallback, registerShutdownSignals, type ShutdownSignal } from "@/framework/support/lifecycle.js";
import { logger } from "@/framework/support/logger.js";

export interface WorkerHandle {
  queues: string[];
  shutdown: (signal: ShutdownSignal) => Promise<void>;
}

/**
 * Why: Starts the queue worker and wires DB/Redis shutdown.
 * When: CLI `queue:work` command or E2E test bootstrap.
 * Where: Worker entrypoint.
 * How: Parses --queue= args, inits DB/Redis, starts workers, registers signals.
 *      When called as the main module, also prints the startup banner.
 */
export async function startQueueWorkerRuntime(queues: string[] = []): Promise<WorkerHandle> {
  if (!queues.length) {
    const queuesArg = process.argv.find((arg) => arg.startsWith("--queue="));
    const queueNames = queuesArg?.split("=")[1];
    queues = parseCsvOrFallback(queueNames, queueConfig.queues);
  }

  await initDatabase();
  await initRedis();
  if (!redisReady()) {
    logger.error("Queue worker cannot start because Redis is unavailable", {
      error: redisError()
    });
    process.exit(1);
  }

  await startQueueWorkers(queues);
  await pruneStaleQueues(queues);
  console.log(`Queue worker started: ${queues.join(", ")}`);

  let shuttingDown = false;

  async function shutdown(signal: ShutdownSignal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Queue worker shutdown signal received", { signal });
    await Promise.allSettled([stopQueueRuntime(), closeDatabase()]);
    await closeRedis();

    process.exit(0);
  }

  registerShutdownSignals(shutdown);

  return { queues, shutdown };
}

const isMain = process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js");
if (isMain) {
  await startQueueWorkerRuntime();
}