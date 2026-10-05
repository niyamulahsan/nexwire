# `shouldQueue` — register a job handler

Imported from the facade: `import { shouldQueue } from "@/framework/facade.js"`.

Registers a worker handler for `queue:job`. Add `{ durable: true }` for checkpointed handlers that survive crashes. Worker startup auto-discovers every `**/jobs/**/*.ts` file, so registrations happen automatically. See [Events & Queue](./../guide/events-queue).

## Signature

| Function      | Signature                                 | Description                                                                            |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `shouldQueue` | `(job, queue, handler, options?) => void` | Register a handler for `queue:job` (add `{ durable: true }` for checkpointed handlers) |

Options:

| Option    | Type      | Default | Description                                                                          |
| --------- | --------- | ------- | ------------------------------------------------------------------------------------ |
| `durable` | `boolean` | `false` | Use `(job, ctx)` signature with `ctx.step()` checkpoints that persist across crashes |

## Use cases

### Basic handler

```ts
import { logger, shouldQueue } from "@/framework/facade.js";

shouldQueue("post.publish", "default", async (job) => {
  logger.info("Post publish job processed", { data: job.data });
  return { ok: true };
});
```

### Durable (checkpointed) handler

Duration-aware handlers use `{ durable: true }` with a `(job, ctx)` signature and `ctx.step(...)` checkpoints:

```ts
shouldQueue(
  "export.report",
  "default",
  async (job, ctx) => {
    await ctx.step("download", () => downloadRows(job.data.query)); // checkpoints persist
    await ctx.step("write", (rows) => generateSpreadsheet(rows));
  },
  { durable: true },
);
```

### Real world — a mail handler

Worker files keep the queue name identical to the event/job name and can keep fanning out events:

```ts
// modules/auth/jobs/registeruser.ts
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, password, userId } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Account Creation",
    html: `<p>Hello ${name},</p><p>Your account was created.</p>`,
  });

  await dispatchEvent(
    "user.changed",
    { id: userId },
    { broadcast: { auth: true } },
  );
  return { ok: true, userId };
});
```

### Real world — a heavy export job

Long-running reports read with eager loading, build an `ExcelJS` workbook, stage a one-time download file, and notify only the requesting user:

```ts
// modules/report/jobs/exportJob.ts
shouldQueue("report.export", "default", async (job) => {
  const { authId, search } = job.data;

  const rows = await db.query.reportRows.findMany({
    where: buildExportWhere({ id: authId }, { search }),
    with: reportRowsWith,
    orderBy: desc(reportRows.id),
  });

  const buffer = Buffer.from(await new ExcelJS.Workbook().xlsx.writeBuffer());

  const token = await storage.generateForDownload({
    prefix: `report_${authId}`,
    extension: "xlsx",
    data: buffer,
  });

  await dispatchEvent(
    "report.export.ready",
    {
      downloadUrl: `/api/report/excel/download/${encodeURIComponent(token)}`,
      authId,
    },
    { broadcast: { users: [authId] } },
  );

  return { ok: true };
});
```

## Notes

- Worker startup (`maker queue:work --queue=default,mail`) auto-discovers and imports every `**/jobs/**/*.ts` file.
- Handlers throw only when Redis is unavailable — the queueing side (`queueJob`/`dispatchEvent`) never throws, it warns and returns `null`.
- Job + queue names must match the enqueueing call: `dispatchEvent(name, …)` → `shouldQueue(name, queue, …)`.

## Related

- [queueJob](./queueJob) · [queue](./queue) · [dispatchEvent](./dispatchEvent)
