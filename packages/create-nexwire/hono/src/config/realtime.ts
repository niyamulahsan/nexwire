import { env } from "@/env.js";

/**
 * Why: Realtime (Socket.IO) settings.
 * When: The realtime server bootstraps and registers its HTTP path.
 * Where: src/config/realtime.ts.
 * How: Reads `SOCKET` from env. `enabled` flips the WebSocket server
 *      on/off; the admin UI is served when the environment is not production.
 */
export const realtimeConfig = {
  enabled: env.SOCKET,
  path: "/socket.io"
};

export type RealtimeConfig = typeof realtimeConfig;
