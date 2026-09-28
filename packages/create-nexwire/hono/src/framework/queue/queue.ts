import { type Job, type JobsOptions, Queue, QueueEvents, Worker } from "bullmq";
import { type DurableContext, type DurableJob, DurableWorker, RedisStateStore } from "bullmq-durable";
import { queueConfig } from "@/config/index.js";
import { discoverModuleFiles, importFile } from "@/framework/modules/discover.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

export type QueueJob = {
  name: string;
  data: any;
};

export type QueueHandler = (job: Job) => Promise<any>;

export type DurableQueueHandler = (job: DurableJob, ctx: DurableContext) => Promise<any>;

export type AnyQueueHandler = QueueHandler | DurableQueueHandler;

const queues = new Map<string, Queue>();
const events = new Map<string, QueueEvents>();
const handlers = new Map<string, QueueHandler>();
const durableHandlers = new Map<string, DurableQueueHandler>();
const workers: Worker[] = [];
let durableStateStore: RedisStateStore | null = null;

function queuePrefix() {
  return queueConfig.prefix;
}

function key(queue: string, job: string) {
  return `${queue}:${job}`;
}

/**
 * Why: Registers a job handler for a queue + job name.
 * When: Module job files are loaded during boot.
 * Where: Module job definition files under `src/modules/<module>/jobs`.
 * How: Stores handler in an in-memory lookup key. Pass `{ durable: true }` to
 *      register a checkpointed handler `(job, ctx)` powered by bullmq-durable;
 *      such a handler can split its work into `ctx.step(...)` checkpoints that
 *      survive crashes/restarts instead of re-running from scratch.
 */
export function shouldQueue(job: string, queue: string, handler: AnyQueueHandler, options: { durable?: boolean } = {}) {
  const target = key(queue || "default", job);
  if (options.durable) {
    durableHandlers.set(target, handler as DurableQueueHandler);
  } else {
    handlers.set(target, handler as QueueHandler);
  }
}

/**
 * Why: Gets or lazily creates a BullMQ queue instance.
 * When: Enqueueing jobs or ensuring queue resources.
 * Where: Queue facade and dispatcher.
 * How: Reuses shared Redis connection and memoized queue map.
 */
export function getQueue(queue = "default") {
  const client = redisClientIfReady();
  if (!client) return null;

  if (!queues.has(queue)) {
    queues.set(
      queue,
      new Queue(queue, {
        connection: client as any,
        prefix: queuePrefix(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 1000,
          removeOnFail: 5000
        }
      })
    );
  }

  return queues.get(queue)!;
}

/**
 * Why: Provides the shared Redis-backed state store for durable queues.
 * When: Durable queue/worker construction.
 * Where: Queue facade internals.
 * How: Creates one `RedisStateStore` reusing the shared Redis client so durable
 *      state lives in Redis without opening extra connections.
 */
function durableStateStoreIfReady() {
  const client = redisClientIfReady();
  if (!client) return null;

  if (!durableStateStore) {
    durableStateStore = new RedisStateStore({ connection: client as never, prefix: queueConfig.durablePrefix });
  }
  return durableStateStore;
}

/**
 * Why: Facade-friendly alias for getQueue.
 * When: Consumers want fluent queue access.
 * Where: Framework facade/API usage.
 * How: Delegates directly to getQueue.
 */
export function queue(queueName = "default") {
  return getQueue(queueName);
}

/**
 * Why: Ensures configured queues exist before UI/runtime usage.
 * When: Queue dashboard setup or startup warmup.
 * Where: Queue UI/bootstrap code.
 * How: Iterates names and resolves queue instances.
 */
export function ensureQueues(queueNames: string[]) {
  for (const queueName of queueNames) {
    getQueue(queueName);
  }
}

/**
 * Why: Returns all created queue instances.
 * When: Queue introspection and dashboard binding.
 * Where: Queue dashboard setup code.
 * How: Converts internal queue map to array.
 */
export function getAllQueues() {
  return Array.from(queues.values());
}

/**
 * Why: Adds a job to BullMQ with project defaults.
 * When: Commands/events need background execution.
 * Where: Dispatcher and feature modules.
 * How: Resolves queue then calls add with retry/backoff options.
 */
export async function queueJob(
  job: string,
  data: any,
  options: {
    queue?: string;
    delay?: number;
    attempts?: number;
    jobId?: string;
    priority?: number;
    removeOnComplete?: JobsOptions["removeOnComplete"];
    removeOnFail?: JobsOptions["removeOnFail"];
    backoff?: JobsOptions["backoff"];
  } = {}
) {
  const queueName = options.queue || "default";
  const queue = getQueue(queueName);
  if (!queue) return null;

  return await queue.add(job, data, {
    delay: options.delay ? options.delay * 1000 : 0,
    attempts: options.attempts ?? 3,
    jobId: options.jobId,
    priority: options.priority,
    removeOnComplete: options.removeOnComplete ?? 1000,
    removeOnFail: options.removeOnFail ?? 5000,
    backoff: options.backoff ?? { type: "exponential", delay: 3000 }
  });
}

/**
 * Why: Loads module job files so handlers are registered.
 * When: Worker start and explicit queue boot flows.
 * Where: Worker/runtime bootstrap.
 * How: Discovers jobs glob and imports each file.
 */
export async function bootQueueJobs() {
  const files = await discoverModuleFiles("**/jobs/*.{ts,js}");
  for (const file of files) await importFile(file);
  return files.length;
}

/**
 * Why: Deletes phantom queues whose names are neither configured nor worked by
 *      this process.
 * When: Queue worker boot, after workers start.
 * Where: Worker runtime bootstrap.
 * How: Scans Redis for `{prefix}*:meta` keys, and for each queue name that is
 *      not in queueConfig.queues nor in the queues this worker was launched
 *      with (--queue), obliterates it only when it holds no live jobs
 *      (waiting/active/delayed/paused/prioritized/waiting-children). Historical
 *      completed/failed entries are ignored so leftover history cannot keep a
 *      dead queue alive. Recreates nothing permanent: BullMQ re-creates a
 *      queue's keys on demand if any code path still dispatches to it.
 */
export async function pruneStaleQueues(protectedQueues: string[] = []) {
  if (!queueConfig.autoPruneQueues) return;

  const client = redisClientIfReady();
  if (!client) return;

  const configured = new Set([...queueConfig.queues, ...protectedQueues]);
  const prefix = `${queuePrefix()}:`;
  const candidates = new Set<string>();

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", `${prefix}*:meta`, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        const name = key.slice(prefix.length, -5);
        if (name && !configured.has(name)) candidates.add(name);
      }
    } while (cursor !== "0");

    for (const name of candidates) {
      try {
        const queue = getQueue(name);
        if (!queue) continue;

        const counts = await queue.getJobCounts("waiting", "active", "delayed", "paused", "prioritized", "waiting-children");
        const live = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
        if (live !== 0) continue;

        await queue.obliterate({ force: true });
        console.log(`Pruned stale queue "${name}"`);
      } catch (error: any) {
        console.warn(`Could not prune stale queue "${name}": ${error?.message || error}`);
      }
    }
  } catch (error: any) {
    console.warn(`Could not scan queues for stale cleanup: ${error?.message || error}`);
  }
}

/**
 * Why: Starts BullMQ workers for selected queues.
 * When: Queue worker process boots.
 * Where: Worker runtime entrypoint.
 * How: Boots handlers, creates QueueEvents, and creates workers.
 */
export async function startQueueWorker(queueNames = ["default"]) {
  await bootQueueJobs();
  const client = redisClientIfReady();
  if (!client) throw new Error("Redis is required for queue workers");

  for (const queueName of queueNames) {
    if (!events.has(queueName)) {
      events.set(queueName, new QueueEvents(queueName, { connection: client as any, prefix: queuePrefix() }));
    }

    const durable = [...durableHandlers.keys()].some((k) => k.startsWith(`${queueName}:`));

    if (durable) {
      const store = durableStateStoreIfReady();
      if (!store) throw new Error("Redis is required for durable queue workers");

      const map: Record<string, AnyQueueHandler> = {};
      for (const [k, h] of handlers) {
        if (k.startsWith(`${queueName}:`)) map[k.slice(queueName.length + 1)] = h;
      }
      for (const [k, h] of durableHandlers) {
        if (k.startsWith(`${queueName}:`)) map[k.slice(queueName.length + 1)] = h;
      }

      const worker = new DurableWorker(queueName, map as never, {
        connection: client as any,
        prefix: queuePrefix(),
        stateStore: store,
        concurrency: 10
      });

      worker.on("completed", (job) => {
        console.log(`[${new Date().toLocaleTimeString()}] Processed:  ${job.name} (${queueName})`);
      });

      worker.on("failed", (job, error) => {
        const jobName = job?.name ?? "unknown";
        console.log(`[${new Date().toLocaleTimeString()}] Failed:     ${jobName} (${queueName}) - ${error.message}`);
      });

      workers.push(worker as unknown as Worker);
      continue;
    }

    const worker = new Worker(
      queueName,
      async (job) => {
        console.log(`[${new Date().toLocaleTimeString()}] Processing: ${job.name} (${queueName})`);
        const handler = handlers.get(key(queueName, job.name));
        if (!handler) throw new Error(`No handler registered for ${queueName}:${job.name}`);
        return await handler(job);
      },
      { connection: client as any, prefix: queuePrefix(), concurrency: 10 }
    );

    worker.on("completed", (job) => {
      console.log(`[${new Date().toLocaleTimeString()}] Processed:  ${job.name} (${queueName})`);
    });

    worker.on("failed", (job, error) => {
      const jobName = job?.name ?? "unknown";
      console.log(`[${new Date().toLocaleTimeString()}] Failed:     ${jobName} (${queueName}) - ${error.message}`);
    });

    workers.push(worker);
  }
}

/**
 * Why: Hard-clears ALL queue-system state for reset workflows.
 * When: Local cleanup and maintenance commands.
 * Where: `queue:clear` command.
 * How: Wipes every BullMQ queue key (including jobs, job schedulers, and
 *      repeat keys for queues not listed in `queues`, e.g. `demo`), plus the
 *      durable key space, by scanning each prefix and deleting in batches.
 *      Cache/session/rate-limit keys are intentionally left alone.
 */
export async function clearQueue() {
  const client = redisClientIfReady();
  if (!client) return;

  for (const prefix of [queuePrefix(), queueConfig.durablePrefix]) {
    const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
    for await (const keys of stream) {
      if (keys.length) await client.del(keys);
    }
  }
}

/**
 * Why: Gracefully stops all workers/events/queues.
 * When: Process shutdown.
 * Where: Server/worker lifecycle hooks.
 * How: Closes resources with Promise.allSettled and clears registries.
 */
export async function stopQueueRuntime() {
  await Promise.allSettled(workers.map((worker) => worker.close()));
  workers.length = 0;

  await Promise.allSettled(Array.from(events.values()).map((queueEvents) => queueEvents.close()));
  events.clear();

  await Promise.allSettled(Array.from(queues.values()).map((queue) => queue.close()));
  queues.clear();

  durableStateStore = null;
}
