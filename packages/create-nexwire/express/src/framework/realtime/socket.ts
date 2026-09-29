import { createAdapter } from "@socket.io/redis-adapter";
import { Server as SocketIOServer } from "socket.io";
import { appConfig, realtimeConfig, redisConfig } from "@/config/index.js";
import { authFromSocketHandshake, unauthenticatedRealtimeAuth } from "@/framework/realtime/socket-cookie.js";
import type { RealtimeAuthContext } from "@/framework/realtime/types.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { logger } from "@/framework/support/logger.js";

export type RealtimeServeWebSocket = Record<string, never>;

export type RealtimeInit = {
  io: SocketIOServer;
  websocketServe: RealtimeServeWebSocket;
};

export const WS_PATH = "/socket.io";

let io: SocketIOServer | null = null;
let adapterSubClient: ReturnType<typeof redisClientIfReady> | null = null;

function socketAllowedOrigins() {
  const origins = [appConfig.url, appConfig.frontendUrl].filter(Boolean) as string[];
  if (realtimeConfig.enabled) origins.push("https://admin.socket.io");
  return [...new Set(origins)];
}

async function attachRedisAdapter() {
  if (!redisConfig.enabled) return;

  const pubClient = redisClientIfReady();
  if (!pubClient) return;

  adapterSubClient = pubClient.duplicate();
  await adapterSubClient.connect();
  io?.adapter(createAdapter(pubClient, adapterSubClient));
}

function registerAuthAndRooms() {
  io?.use(async (socket, next) => {
    const auth = await authFromSocketHandshake(socket);
    socket.data.auth = auth as RealtimeAuthContext;

    if (auth.isAuthenticated) {
      socket.join("auth");
      if (auth.userId) socket.join(`user:${auth.userId}`);
      for (const role of auth.roles) socket.join(`role:${role}`);
    } else {
      socket.join("guest");
    }

    next();
  });

  io?.on("connection", (socket) => {
    const auth = (socket.data.auth || unauthenticatedRealtimeAuth()) as RealtimeAuthContext;

    logger.debug("Socket connected", {
      socketId: socket.id,
      authenticated: auth.isAuthenticated,
      userId: auth.userId
    });

    socket.on("join", (room) => socket.join(String(room)));
    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", {
        socketId: socket.id,
        reason,
        authenticated: auth.isAuthenticated,
        userId: auth.userId
      });
    });
  });
}

export async function initRealtime(target: { httpServer: any }): Promise<RealtimeInit | null> {
  if (!realtimeConfig.enabled) {
    logger.info("Socket.IO disabled (disabled in config)");
    return null;
  }

  if (io) return { io, websocketServe: {} };

  io = new SocketIOServer(target.httpServer, {
    cors: { origin: socketAllowedOrigins(), credentials: true }
  });

  await attachRedisAdapter();
  registerAuthAndRooms();

  logger.info(`Socket.IO enabled at ${WS_PATH}`);
  return { io, websocketServe: {} };
}

export function socketServer() {
  return io;
}

export function ioServer() {
  return io;
}

export async function closeRealtime() {
  if (!io) return;

  await new Promise<void>((resolve) => {
    io?.close(() => resolve());
  });

  if (adapterSubClient) {
    try {
      await adapterSubClient.quit();
    } catch {
      adapterSubClient.disconnect();
    }
    adapterSubClient = null;
  }

  io = null;
}
