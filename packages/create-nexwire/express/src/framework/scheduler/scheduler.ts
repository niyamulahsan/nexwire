import { Cron } from "croner";
import { discoverModuleFiles, importFile } from "@/framework/modules/discover.js";
import { getQueue } from "@/framework/queue/queue.js";
import { runWithLock } from "@/framework/scheduler/lock.js";

type Schedule = {
  name: string;
  expression: string;
  handler?: () => void | Promise<void>;
  /** Queue mode: on each tick dispatches `job` to the given queue for its worker to process. */
  queue?: string;
  /** Queue mode: job name enqueued on each tick (defaults to `name`). */
  job?: string;
  /** Queue mode: static data passed to every enqueued job. */
  data?: any;
  timezone?: string;
  /** Queue mode: also dispatch one job immediately at scheduler boot. */
  immediately?: boolean;
  runOnInit?: boolean;
  enabled?: boolean;
  ttlMs?: number;
};

const schedules: Schedule[] = [];
const tasks: Cron[] = [];

const PAD = 60;

function pad(str: string, len: number, char = " ") {
  return str.length >= len ? str : str + char.repeat(len - str.length);
}

function printHeader() {
  console.log("");
  console.log("Running Scheduled Commands");
  console.log(`${"=".repeat(PAD)}`);
}

function printScheduleResult(name: string, startMs: number, success: boolean, _message?: string) {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
  const now = new Date().toLocaleString("en-GB", { hour12: true });
  const dots = ".".repeat(Math.max(1, PAD - name.length - 8));
  const status = success ? `${elapsed}s` : `FAIL`;
  console.log(` ${name} ${dots} ${status}`);
}

/**
 * Why: Registers a cron schedule definition at runtime.
 * When: Module console/schedule files are imported.
 * Where: Scheduler-related module files.
 * How: Pushes normalized schedule config into in-memory registry. Handler
 *      schedules run an in-process callback on each tick; queue-mode schedules
 *      dispatch a job to their queue on each tick. `schedule:work` is the sole
 *      trigger — queue workers never fire schedules on their own.
 */
export function defineSchedule(schedule: Schedule) {
  const normalized = { enabled: true, runOnInit: false, ttlMs: 120_000, ...schedule };
  schedules.push(normalized);

  if (normalized.queue) {
    // nothing to pre-register: schedule:work dispatches on each tick
  } else if (!normalized.handler) {
    console.warn(`Schedule "${normalized.name}" has no handler and no queue; nothing will run`);
  }
}

/**
 * Why: Loads module schedule files so schedules are registered.
 * When: Scheduler boot process starts.
 * Where: Scheduler worker startup.
 * How: Discovers schedules/console files and imports them.
 */
export async function bootSchedules() {
  const files = await discoverModuleFiles("**/{schedules,console}/*.{ts,js}");
  for (const file of files) await importFile(file);
  return files.length;
}

function handlerRun(schedule: Schedule) {
  return async () => {
    await runWithLock(
      schedule.name,
      async () => {
        const startMs = Date.now();
        try {
          await schedule.handler!();
          printScheduleResult(schedule.name, startMs, true);
        } catch (err: any) {
          printScheduleResult(schedule.name, startMs, false, err?.message || String(err));
        }
      },
      { ttlMs: schedule.ttlMs }
    );
  };
}

function queueDispatchRun(schedule: Schedule) {
  return async () => {
    await runWithLock(
      schedule.name,
      async () => {
        const startMs = Date.now();
        try {
          const queue = getQueue(schedule.queue);
          if (!queue) throw new Error(`Queue "${schedule.queue}" is unavailable`);
          await queue.add(schedule.job ?? schedule.name, schedule.data ?? {});
          printScheduleResult(schedule.name, startMs, true);
        } catch (err: any) {
          printScheduleResult(schedule.name, startMs, false, err?.message || String(err));
        }
      },
      { ttlMs: schedule.ttlMs }
    );
  };
}

/**
 * Why: Starts cron tasks for all enabled schedules.
 * When: Scheduler worker process boots.
 * Where: `schedule:work` runtime.
 * How: Creates a croner task per enabled schedule — handler schedules run the
 *      callback in-process, queue-mode schedules dispatch a job to their queue
 *      on each tick (the target worker processes it). Boots once for
 *      `runOnInit` handlers and `immediately` queue schedules.
 */
export async function startScheduler() {
  await bootSchedules();

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const run = schedule.handler ? handlerRun(schedule) : queueDispatchRun(schedule);
    tasks.push(new Cron(schedule.expression, { timezone: schedule.timezone, name: schedule.name }, run));
  }

  printHeader();

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    if (schedule.handler && schedule.runOnInit) await handlerRun(schedule)();
    if (schedule.queue && schedule.immediately) await queueDispatchRun(schedule)();
  }

  return schedules.length;
}

/**
 * Why: Stops and destroys active cron tasks.
 * When: Scheduler shutdown.
 * Where: Process lifecycle handlers.
 * How: Iterates task registry and invokes stop on each croner job.
 */
export async function stopScheduler() {
  await Promise.all(tasks.map((task) => task.stop()));
  tasks.length = 0;
}
