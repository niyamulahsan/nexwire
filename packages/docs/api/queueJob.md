# `queueJob` — enqueue a background job

Imported from the facade: `import { queueJob } from "@/framework/facade.js"`.

Enqueues a job into a BullMQ queue with retry/backoff defaults, and returns the `Job` (or `null` when Redis is unavailable). See [Events & Queue](./../guide/events-queue).

## Signature

| Function   | Signature                                    | Description                               |
| ---------- | -------------------------------------------- | ----------------------------------------- |
| `queueJob` | `(job, data, options?) => Promise<Job \| null>` | Enqueue a job with retry/backoff defaults |

Options:

| Option             | Type     | Default                                | Description                                           |
| ------------------ | -------- | -------------------------------------- | ----------------------------------------------------- |
| `queue`            | `string` | `"default"`                            | Target queue name                                     |
| `delay`            | `number` | `0`                                    | Delay in seconds before the job is visible to workers |
| `attempts`         | `number` | `3`                                    | Maximum retries if the job fails                      |
| `jobId`            | `string` | auto                                   | Custom ID for idempotency (duplicates prevented)      |
| `priority`         | `number` | —                                      | Higher number processed first                         |
| `backoff`          | `object` | `{ type: "exponential", delay: 3000 }` | Retry strategy: `"exponential"` or `"fixed"`          |
| `removeOnComplete` | `number` | `1000`                                 | Keep at most N completed jobs                         |
| `removeOnFail`     | `number` | `5000`                                 | Keep at most N failed jobs                            |

## Use cases

### Enqueue with options

```ts
import { queueJob } from "@/framework/facade.js";

await queueJob(
  "process-image",
  { path: "/tmp/photo.jpg" },
  {
    queue: "images",
    delay: 30, // seconds from now
    attempts: 5, // retry up to 5 times
    priority: 10, // higher = processed first
    jobId: "img-123", // custom ID — prevents duplicates
    backoff: { type: "fixed", delay: 5000 }, // 5s between retries
    removeOnComplete: 500,
    removeOnFail: 2000,
  },
);
```

### When Redis is off

```ts
const job = await queueJob("process-image", { path });
if (job === null) {
  /* Redis unavailable — the job never ran. A warning was already logged. */
}
```

The `null` return means the work was dropped, not deferred. `queueJob` logs a warning once per queue and job name naming the job, its queue, and both ways forward, so a caller that ignores the return value still leaves a trace. See [Graceful Degradation](./../guide/events-queue#graceful-degradation).

## Notes

- Requires Redis; returns `null` (never throws) when Redis is unavailable on the app side, and warns once per job so the loss is visible.
- A dropped job is not retried, not persisted, and not shown in BullBoard. To run the work immediately instead, use [`dispatchCommand`](./dispatchCommand) without `{ async: true }`.
- Default queue resources: `attempts: 3`, exponential backoff 3s, keep 1000 completed / 5000 failed — override per enqueue.
- Handlers register with `shouldQueue(job, queue, fn)`; the job name and queue name must match.

## Related

- [shouldQueue](./shouldQueue) · [queue](./queue) · [dispatchEvent](./dispatchEvent)
