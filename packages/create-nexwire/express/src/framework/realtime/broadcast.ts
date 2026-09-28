import { env } from "@/env.js";
import { socketServer } from "@/framework/realtime/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

export type BroadcastOptions = {
  users?: Array<string | number>;
  roles?: string[];
  rooms?: string[];
  auth?: boolean;
  all?: boolean;
};

/**
 * Why: Emits realtime events to targeted audiences.
 * When: Domain events need websocket fan-out.
 * Where: Event dispatcher and module jobs.
 * How: Emits via Socket.IO if available; otherwise relays through Redis pub/sub
 *      so the main process (which has Socket.IO) can broadcast it.
 */
function emitViaIo(event: string, payload: any, options: BroadcastOptions) {
  const io = socketServer();
  if (!io) return;

  if (options.all) io.emit(event, payload);
  if (options.auth) io.to("auth").emit(event, payload);

  for (const user of options.users || []) io.to(`user:${user}`).emit(event, payload);
  for (const role of options.roles || []) io.to(`role:${role}`).emit(event, payload);
  for (const room of options.rooms || []) io.to(room).emit(event, payload);
}

export function broadcast(event: string, payload: any, options: BroadcastOptions = {}) {
  const io = socketServer();

  if (io) {
    emitViaIo(event, payload, options);
    return;
  }

  // No Socket.IO in this process — relay through Redis so the main process can broadcast
  const redis = redisClientIfReady();
  if (!redis) return;

  const channel = `${env.REDIS_PREFIX}:broadcast`;
  redis.publish(channel, JSON.stringify({ event, payload, options }));
}
