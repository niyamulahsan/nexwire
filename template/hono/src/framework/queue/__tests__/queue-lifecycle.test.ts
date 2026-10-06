import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle for the queue runtime.
 *
 * A queue worker process is long-lived and is restarted by whatever supervises
 * it: `npm run maker queue:work` under systemd, Docker, a Kubernetes
 * Deployment, or a developer's own Ctrl-C loop. Every boot opens BullMQ queues,
 * queue-event streams and workers; only `stopQueueRuntime` gives them back.
 *
 * The bug this file exists for is the durable state store. `queue.ts` caches one
 * `RedisStateStore` in a module-level variable, and `stopQueueRuntime` sets that
 * variable to `null` without ever calling `close()` on it. But the store opens
 * its **own** Redis client the first time it is used - bullmq-durable does this
 * deliberately, so that merely constructing a store costs no connection. So:
 *
 *   boot 1 -> store built, a durable job runs, store opens connection A
 *   stop   -> `durableStateStore = null`. Connection A is still open.
 *   boot 2 -> a *new* store is built, connection B.
 *   ...
 *
 * Nothing ever quits those connections. A worker that restarts ten times over a
 * deploy leaves ten orphaned Redis connections behind, and `maxclients` is
 * reached by a process that looks like it opens nothing at all. The symptom
 * appears on an unrelated service first - "OOM command not allowed", or
 * connection-refused from the web tier minutes after the queue worker restarted.
 *
 * So these tests count what is still open after teardown, rather than checking
 * that a function was called.
 */

const state = vi.hoisted(() => ({
  workers: [] as Array<Record<string, any>>,
  durableWorkers: [] as Array<Record<string, any>>,
  queues: [] as Array<Record<string, any>>,
  eventStreams: [] as Array<Record<string, any>>,
  stores: [] as Array<Record<string, any>>,
  redisKeys: [] as string[],
  deleted: [] as string[],
  config: { queues: ["default", "mail", "maintenance"] as string[], autoPruneQueues: true },
  redisAvailable: false,
  /** Live-job counts the fake BullMQ queue reports, keyed by queue name. */
  jobCounts: {} as Record<string, number>,
  failClose: new Set<string>(),
  failScan: false,
  failObliterate: false,
  jobFiles: [] as string[],
  logs: [] as string[],
  warnings: [] as string[]
}));

/** Queue key prefix, matching a real REDIS_PREFIX. */
const PREFIX = "nexwire:queue";
const DURABLE_PREFIX = "nexwire:durable";

vi.mock("@/config/index.js", () => ({
  get queueConfig() {
    return {
      queues: state.config.queues,
      autoPruneQueues: state.config.autoPruneQueues,
      prefix: PREFIX,
      durablePrefix: DURABLE_PREFIX,
      queueUi: "/queues"
    };
  }
}));

vi.mock("@/framework/redis/client.js", () => ({
  redisClientIfReady: () => (state.redisAvailable ? fakeRedis() : null)
}));

vi.mock("@/framework/modules/discover.js", () => ({
  discoverModuleFiles: async () => state.jobFiles,
  importFile: async (file: string) => {
    state.logs.push(`import:${file}`);
  }
}));

/** The shared Redis client. `scan` and `scanStream` drive the prune/clear paths. */
function fakeRedis() {
  const client = {
    async scan(_cursor: string, _matchCmd: string, pattern: string) {
      if (state.failScan) throw new Error("READONLY You can't write against a read only replica.");
      const glob = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      return ["0", state.redisKeys.filter((key) => glob.test(key))];
    },
    scanStream({ match }: { match: string }) {
      const glob = new RegExp(`^${match.replace(/\*/g, ".*")}$`);
      const batches = [
        state.redisKeys.filter((key) => glob.test(key)).slice(0, 2),
        state.redisKeys.filter((key) => glob.test(key)).slice(2)
      ];
      return (async function* () {
        for (const batch of batches) if (batch.length) yield batch;
      })();
    },
    async del(keys: string[]) {
      state.deleted.push(...keys);
      for (const key of keys) state.redisKeys = state.redisKeys.filter((k) => k !== key);
      return keys.length;
    }
  };
  return client;
}

/** A close handle that records whether the resource was actually released. */
function closer(kind: string, owner: { closed: boolean }) {
  return async () => {
    if (state.failClose.has(kind)) throw new Error(`${kind} close failed`);
    owner.closed = true;
    return true;
  };
}

vi.mock("bullmq", () => {
  class Queue {
    name: string;
    closed = false;
    obliterated = false;
    options: unknown;

    constructor(name: string, options?: unknown) {
      this.name = name;
      this.options = options;
      if (state.failClose.has("queue")) throw new Error("queue construction failed");
      state.queues.push(this);
    }

    async add(job: string, data: unknown, options: unknown) {
      state.logs.push(`add:${this.name}:${job}:${JSON.stringify(options)}`);
      return { id: "1", name: job, data, opts: options };
    }

    async getJobCounts(...types: string[]) {
      const perQueue = state.jobCounts[this.name] ?? 0;
      return Object.fromEntries(types.map((type) => [type, perQueue]));
    }

    async obliterate() {
      if (state.failObliterate) throw new Error("OOM command not allowed");
      this.obliterated = true;
    }

    close = closer("queue", this);
  }

  class QueueEvents {
    name: string;
    closed = false;

    constructor(name: string) {
      this.name = name;
      state.eventStreams.push(this);
    }

    close = closer("events", this);
  }

  class Worker {
    queueName: string;
    processor: (job: any) => Promise<unknown>;
    handlers: Record<string, Array<(...args: any[]) => void>> = {};
    closed = false;
    options: unknown;

    constructor(queueName: string, processor: (job: any) => Promise<unknown>, options?: unknown) {
      this.queueName = queueName;
      this.processor = processor;
      this.options = options;
      state.workers.push(this);
    }

    on(event: string, handler: (...args: any[]) => void) {
      (this.handlers[event] ||= []).push(handler);
      return this;
    }

    close = closer("worker", this);

    /** Fires an event the way BullMQ would. */
    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers[event] || []) handler(...args);
    }
  }

  return { Queue, QueueEvents, Worker };
});

vi.mock("bullmq-durable", () => {
  class RedisStateStore {
    options: unknown;
    prefix: string;
    /** Set on first use - this is the connection that leaks. */
    client: Record<string, any> | null = null;
    closed = false;

    constructor(options: unknown) {
      this.options = options;
      this.prefix = (options as { prefix?: string })?.prefix ?? "";
      state.stores.push(this);
    }

    /** Mirrors bullmq-durable: the client is opened lazily, on first use. */
    use() {
      if (!this.client) {
        this.client = { quitCalls: 0, async quit() { this.quitCalls++; } };
      }
      return this.client;
    }

    close = closer("store", this);
  }

  class DurableWorker {
    queueName: string;
    handlers: Record<string, unknown>;
    closed = false;
    options: unknown;
    listeners: Record<string, Array<(...args: any[]) => void>> = {};

    constructor(queueName: string, handlers: Record<string, unknown>, options?: unknown) {
      this.queueName = queueName;
      this.handlers = handlers;
      this.options = options;
      state.durableWorkers.push(this);
    }

    on(event: string, handler: (...args: any[]) => void) {
      (this.listeners[event] ||= []).push(handler);
      return this;
    }

    close = closer("durableWorker", this);
  }

  return { RedisStateStore, DurableWorker };
});

/** A fresh module each test: the registries live at module scope. */
async function loadQueue() {
  vi.resetModules();
  return import("@/framework/queue/queue.js");
}

/** Durable stores that opened a connection and never quit it. */
function leakedStoreConnections() {
  return state.stores.filter((store) => store.client && !store.closed);
}

async function bootDurableWorker(queueName = "default") {
  const module_ = await loadQueue();
  module_.shouldQueue("reports.build", queueName, async () => "done", { durable: true });
  await module_.startQueueWorker([queueName]);
  // Touch the store the way a durable job would, so it opens its own client.
  // This has to happen after startQueueWorker: the store is built lazily, inside
  // the worker's construction.
  state.stores.at(-1)?.use();
  return module_;
}

beforeEach(() => {
  state.workers.length = 0;
  state.durableWorkers.length = 0;
  state.queues.length = 0;
  state.eventStreams.length = 0;
  state.stores.length = 0;
  state.redisKeys = [];
  state.deleted = [];
  state.config = { queues: ["default", "mail", "maintenance"], autoPruneQueues: true };
  state.redisAvailable = false;
  state.jobCounts = {};
  state.failClose = new Set();
  state.failScan = false;
  state.failObliterate = false;
  state.jobFiles = [];
  state.logs = [];
  state.warnings = [];
  vi.spyOn(console, "log").mockImplementation((...args) => state.logs.push(args.join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...args) => state.warnings.push(args.join(" ")));
});

describe("starting the queue worker", () => {
  it("refuses to start without Redis, before opening anything", async () => {
    // REDIS=false is the default in a freshly scaffolded project, so this is the
    // path most people hit first. It must not leave half a worker behind.
    state.redisAvailable = false;
    const module_ = await loadQueue();

    await expect(module_.startQueueWorker(["default"])).rejects.toThrow("Redis is required for queue workers");

    expect(state.workers).toHaveLength(0);
    expect(state.durableWorkers).toHaveLength(0);
    expect(state.eventStreams).toHaveLength(0);
  });

  it("opens one worker per queue it was asked to work", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();

    await module_.startQueueWorker(["default", "mail"]);

    expect(state.workers.map((worker) => worker.queueName)).toEqual(["default", "mail"]);
  });

  it("does not start a second worker for a queue it is already working", async () => {
    // Each `Worker` opens its own Redis blocking connection. Starting the runtime
    // twice - a supervisor retry, or `queue:work default` followed by a bare
    // `queue:work` - silently doubles the connections and the per-job log lines
    // with no benefit, and nothing warns. Boot/stop/boot in one process is
    // exactly what a hot-reloading dev server does.
    state.redisAvailable = true;
    const module_ = await loadQueue();

    await module_.startQueueWorker(["default"]);
    await module_.startQueueWorker(["default"]);

    expect(state.workers).toHaveLength(1);
  });

  it("opens one event stream per queue, however many times it is asked", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();

    await module_.startQueueWorker(["default"]);
    await module_.startQueueWorker(["default"]);

    expect(state.eventStreams).toHaveLength(1);
  });

  it("runs the handler registered for a job", async () => {
    state.redisAvailable = true;
    const seen: unknown[] = [];
    const module_ = await loadQueue();
    module_.shouldQueue("orders.import", "default", async (job: any) => {
      seen.push(job.data);
      return "ok";
    });
    await module_.startQueueWorker(["default"]);

    const result = await state.workers[0].processor({ name: "orders.import", data: { id: 7 } });

    expect(result).toBe("ok");
    expect(seen).toEqual([{ id: 7 }]);
  });

  it("keeps queues and jobs apart, so a same-named job on another queue is not borrowed", async () => {
    // Handlers are keyed `queue:job`. Keying on the job name alone would let
    // `mail` run the `default` queue's handler, which is the kind of bug that
    // sends password-reset payloads through the wrong worker.
    state.redisAvailable = true;
    const module_ = await loadQueue();
    module_.shouldQueue("send", "mail", async () => "mail-handler");
    module_.shouldQueue("send", "default", async () => "default-handler");
    await module_.startQueueWorker(["default", "mail"]);

    const defaultWorker = state.workers.find((worker) => worker.queueName === "default");
    const mailWorker = state.workers.find((worker) => worker.queueName === "mail");

    await expect(defaultWorker.processor({ name: "send" })).resolves.toBe("default-handler");
    await expect(mailWorker.processor({ name: "send" })).resolves.toBe("mail-handler");
  });

  it("names the job when it arrives with no handler, rather than failing silently", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();
    await module_.startQueueWorker(["default"]);

    // BullMQ retries a throwing processor three times and then parks the job as
    // failed. A generic error leaves the operator hunting for which job died.
    await expect(state.workers[0].processor({ name: "mystery.job" })).rejects.toThrow(
      "No handler registered for default:mystery.job"
    );
  });

  it("reports a job it finished, and a job it failed", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();
    await module_.startQueueWorker(["default"]);

    state.workers[0].emit("completed", { name: "orders.import" });
    state.workers[0].emit("failed", { name: "orders.export" }, new Error("S3 unreachable"));

    const output = state.logs.join("\n");
    expect(output).toContain("Processed:  orders.import (default)");
    // The error text belongs in the log. A failure line without the reason sends
    // the operator to Redis to inspect a job that may look perfectly healthy.
    expect(output).toContain("Failed:     orders.export (default) - S3 unreachable");
  });

  it("still names the job when a failure arrives with no job attached", async () => {
    // BullMQ can emit `failed` with a null job when the failure happens before
    // deserialisation. Reading `job.name` unguarded throws inside the listener,
    // which takes the worker's event emitter down with it.
    state.redisAvailable = true;
    const module_ = await loadQueue();
    await module_.startQueueWorker(["default"]);

    expect(() => state.workers[0].emit("failed", null, new Error("worker crashed"))).not.toThrow();
    expect(state.logs.join("\n")).toContain("unknown (default) - worker crashed");
  });

  it("uses a durable worker when a queue has a durable handler", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();
    module_.shouldQueue("reports.build", "default", async () => "done", { durable: true });

    await module_.startQueueWorker(["default"]);

    expect(state.durableWorkers).toHaveLength(1);
    expect(state.workers).toHaveLength(0);
    expect(Object.keys(state.durableWorkers[0].handlers)).toEqual(["reports.build"]);
  });

  it("loads the module job files before working anything", async () => {
    // Handlers register themselves at import time, so a worker that starts
    // consuming before the files load rejects every job with "no handler".
    state.redisAvailable = true;
    state.jobFiles = ["src/modules/billing/jobs/invoice.ts"];
    const module_ = await loadQueue();

    await module_.startQueueWorker(["default"]);

    expect(state.logs).toContain("import:src/modules/billing/jobs/invoice.ts");
  });
});

describe("stopping the queue runtime", () => {
  it("gives back every worker, event stream and queue it opened", async () => {
    state.redisAvailable = true;
    const module_ = await loadQueue();
    await module_.startQueueWorker(["default", "mail"]);
    module_.getQueue("reports");

    await module_.stopQueueRuntime();

    expect(state.workers).toHaveLength(2);
    expect(state.eventStreams).toHaveLength(2);
    expect(state.workers.every((worker) => worker.closed)).toBe(true);
    expect(state.eventStreams.every((stream) => stream.closed)).toBe(true);
    // The one queue the caller opened by hand. Workers hold their own internal
    // queue, so this is the only producer-side queue in play.
    expect(state.queues.map((queue) => queue.name)).toEqual(["reports"]);
    expect(state.queues[0].closed).toBe(true);
  });

  it("closes the durable state store, so its own Redis connection is released", async () => {
    // The leak. `stopQueueRuntime` sets the module-level store to `null`
    // without calling `close()`, and `close()` is the only thing that quits the
    // connection the store opened for itself.
    state.redisAvailable = true;
    const module_ = await bootDurableWorker();

    expect(state.stores).toHaveLength(1);
    expect(state.stores[0].client).not.toBeNull();

    await module_.stopQueueRuntime();

    expect(state.stores[0].closed).toBe(true);
    expect(leakedStoreConnections()).toHaveLength(0);
  });

  it("leaks no durable connection across repeated restarts", async () => {
    // What a supervisor does on every deploy: boot, work, shut down, boot.
    // Ten cycles must leave behind exactly as much as one.
    state.redisAvailable = true;

    for (let cycle = 0; cycle < 10; cycle++) {
      const module_ = await bootDurableWorker();
      await module_.stopQueueRuntime();
    }

    expect(leakedStoreConnections()).toHaveLength(0);
    expect(state.stores).toHaveLength(10);
    expect(state.stores.every((store) => store.closed)).toBe(true);
  });

  it("empties its registries, so the next boot starts clean", async () => {
    // A closed queue left in the memo map is handed back to the next caller,
    // which then writes jobs into a queue nobody is listening on.
    state.redisAvailable = true;
    const module_ = await loadQueue();
    await module_.startQueueWorker(["default"]);
    module_.getQueue("reports");

    await module_.stopQueueRuntime();

    expect(module_.getAllQueues()).toEqual([]);
  });

  it("still closes the rest when one resource refuses to close", async () => {
    // `run.ts` and `server.ts` both call `stopQueueRuntime` during shutdown, and
    // a socket.io teardown has usually already closed something. One rejection
    // must not abandon the remaining handles.
    state.redisAvailable = true;
    state.failClose = new Set(["worker"]);
    const module_ = await bootDurableWorker();
    module_.getQueue("reports");

    await expect(module_.stopQueueRuntime()).resolves.toBeUndefined();

    expect(module_.getAllQueues()).toEqual([]);
    expect(state.stores[0].closed).toBe(true);
  });

  it("is safe when nothing was ever started", async () => {
    const module_ = await loadQueue();

    await expect(module_.stopQueueRuntime()).resolves.toBeUndefined();
  });

  it("is safe to call twice, from two shutdown paths at once", async () => {
    // Both `run.ts` and `server.ts` call it on the same exit path in a combined
    // dev run. The second call must not throw on an already-cleared registry.
    state.redisAvailable = true;
    const module_ = await bootDurableWorker();

    await module_.stopQueueRuntime();

    await expect(module_.stopQueueRuntime()).resolves.toBeUndefined();
  });

  it("lets a worker start again after a shutdown", async () => {
    // A registry that was cleared but not reset to "nothing is running" would
    // make the second boot a no-op, and the queue would sit unworked with no
    // error anywhere.
    state.redisAvailable = true;
    const module_ = await bootDurableWorker();
    await module_.stopQueueRuntime();

    await module_.startQueueWorker(["default"]);

    expect(state.durableWorkers).toHaveLength(2);
  });
});

describe("pruning queues that no longer exist", () => {
  it("never touches a queue the project configured", async () => {
    // `mail` was renamed out of QUEUE_QUEUES but a job is still in flight on
    // it. Deleting it loses that job with no error and no record.
    state.redisAvailable = true;
    state.redisKeys = [`${PREFIX}:mail:meta`, `${PREFIX}:ghost:meta`];
    const module_ = await loadQueue();

    await module_.pruneStaleQueues();

    const ghost = state.queues.find((queue) => queue.name === "ghost");
    expect(ghost?.obliterated).toBe(true);
    expect(state.queues.find((queue) => queue.name === "mail")?.obliterated).toBeFalsy();
  });

  it("never touches a queue this worker was launched with", async () => {
    // The worker was started with `--queue reports`, but `reports` is not in
    // QUEUE_QUEUES. Pruning would delete the queue it is actively working.
    state.redisAvailable = true;
    state.redisKeys = [`${PREFIX}:reports:meta`];
    const module_ = await loadQueue();

    await module_.pruneStaleQueues(["reports"]);

    expect(state.queues.find((queue) => queue.name === "reports")?.obliterated).toBeFalsy();
  });

  it("leaves a stale queue that still holds a live job", async () => {
    // History is deliberately not counted, so a queue with only completed and
    // failed entries is prunable; one waiting to be picked up is not.
    state.redisAvailable = true;
    state.redisKeys = [`${PREFIX}:ghost:meta`];
    state.jobCounts.ghost = 1;
    const module_ = await loadQueue();

    await module_.pruneStaleQueues();

    expect(state.queues.find((queue) => queue.name === "ghost")?.obliterated).toBeFalsy();
  });

  it("does nothing at all when auto-pruning is switched off", async () => {
    // AUTO_PRUNE_QUEUES=false is the setting for anyone who manages queue keys
    // from outside the app. It must not even look.
    state.redisAvailable = true;
    state.config.autoPruneQueues = false;
    state.redisKeys = [`${PREFIX}:ghost:meta`];
    const module_ = await loadQueue();

    await module_.pruneStaleQueues();

    expect(state.queues).toHaveLength(0);
  });

  it("does nothing when Redis is unavailable", async () => {
    state.redisAvailable = false;
    const module_ = await loadQueue();

    await expect(module_.pruneStaleQueues()).resolves.toBeUndefined();

    expect(state.queues).toHaveLength(0);
  });

  it("survives a Redis that refuses the scan", async () => {
    // A read-only replica, or a failover mid-boot. `maker queue:work` must still
    // start its workers; pruning is housekeeping, not a prerequisite.
    state.redisAvailable = true;
    state.failScan = true;
    const module_ = await loadQueue();

    await expect(module_.pruneStaleQueues()).resolves.toBeUndefined();
    expect(state.warnings.join("\n")).toContain("Could not scan queues for stale cleanup");
  });

  it("keeps pruning after one queue refuses to be deleted", async () => {
    // One queue being locked or busy must not abandon the rest.
    state.redisAvailable = true;
    state.redisKeys = [`${PREFIX}:ghost-one:meta`, `${PREFIX}:ghost-two:meta`];
    state.failObliterate = true;
    const module_ = await loadQueue();

    await expect(module_.pruneStaleQueues()).resolves.toBeUndefined();
    expect(state.warnings.join("\n")).toContain("Could not prune stale queue");
  });
});

describe("clearing every queue", () => {
  it("wipes the queue and durable key spaces, and nothing else", async () => {
    // `maker queue:clear` is run to recover from a wedged queue. If the pattern
    // widened to the bare Redis prefix it would take the cache, sessions and
    // rate-limit counters with it, and every logged-in user would be logged out.
    state.redisAvailable = true;
    state.redisKeys = [
      `${PREFIX}:default:meta`,
      `${PREFIX}:default:1`,
      `${DURABLE_PREFIX}:instance:abc`,
      "nexwire:ratelimit:1.2.3.4",
      "nexwire:cache:homepage",
      "nexwire:session:xyz"
    ];
    const module_ = await loadQueue();

    await module_.clearQueue();

    expect(state.deleted).toEqual(
      expect.arrayContaining([`${PREFIX}:default:meta`, `${PREFIX}:default:1`, `${DURABLE_PREFIX}:instance:abc`])
    );
    expect(state.deleted).not.toContain("nexwire:ratelimit:1.2.3.4");
    expect(state.deleted).not.toContain("nexwire:cache:homepage");
    expect(state.deleted).not.toContain("nexwire:session:xyz");
  });

  it("returns quietly when Redis is unavailable", async () => {
    state.redisAvailable = false;
    const module_ = await loadQueue();

    await expect(module_.clearQueue()).resolves.toBeUndefined();
    expect(state.deleted).toEqual([]);
  });
});