import { redisConfig } from "./redis.js";

/**
 * Why: Queue workers, concurrency, and BullMQ key namespaces.
 * When: The queue facade bootstraps workers and the dashboard connects.
 * Where: src/config/queue.ts.
 * How: `queues` lists which queue names get a worker by default (default,
 *      mail, maintenance). `concurrency` caps parallel jobs per worker.
 *      Key prefixes derive from the shared `REDIS_PREFIX`.
 */
export const queueConfig = {
  queues: ["default", "mail", "maintenance"],
  concurrency: 10,
  /**
   * autoPruneQueues
   * Why: Automatically deletes phantom queues (Redis keys for queue names that
   *      no longer exist in `queues`) when a queue worker boots. Safe because
   *      only empty, unconfigured queues are removed, and BullMQ recreates a
   *      queue's keys on demand if code still dispatches to it.
   * When: Set false to disable automatic pruning and rely on manual
   *      `queue:clear` instead.
   */
  autoPruneQueues: true,
  prefix: `${redisConfig.prefix}:queue`,
  durablePrefix: `${redisConfig.prefix}:durable`,
  queueUi: "/queues",
  allowedEmails: ""
};

export type QueueConfig = typeof queueConfig;
