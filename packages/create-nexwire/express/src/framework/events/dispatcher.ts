import { queueJob } from "@/framework/queue/queue.js";
import { type BroadcastOptions, broadcast } from "@/framework/realtime/broadcast.js";

type CommandHandler = (payload: any) => Promise<any>;

const commandHandlers = new Map<string, CommandHandler>();

/**
 * Why: Registers in-memory command handler for synchronous dispatch.
 * When: Module startup files register command handlers.
 * Where: Job/command style module code.
 * How: Stores handler in a process-level map by command name.
 */
export function command(name: string, handler: CommandHandler) {
  commandHandlers.set(name, handler);
}

/**
 * Why: Executes command immediately or queues it for async processing.
 * When: Application logic needs command pattern behavior.
 * Where: Controllers, jobs, and service layers.
 * How: Runs local handler unless async requested; otherwise enqueues.
 */
export async function dispatchCommand(name: string, payload: any, options: { async?: boolean; queue?: string } = {}) {
  if (!options.async) {
    const handler = commandHandlers.get(name);
    if (handler) return await handler(payload);
  }

  return await queueJob(name, payload, { queue: options.queue || "default" });
}

/**
 * Why: Dispatches domain events with optional queueing and websocket fan-out.
 * When: Domain actions need side effects or realtime notifications.
 * Where: Controllers/jobs across modules.
 * How: Broadcasts via Socket.IO and optionally enqueues job.
 */
export async function dispatchEvent(name: string, payload: any, options: { queue?: boolean | string; broadcast?: BroadcastOptions } = {}) {
  if (options.broadcast) {
    broadcast(name, payload, options.broadcast);
  }

  if (options.queue) {
    return await queueJob(name, payload, {
      queue: typeof options.queue === "string" ? options.queue : "default"
    });
  }
}
