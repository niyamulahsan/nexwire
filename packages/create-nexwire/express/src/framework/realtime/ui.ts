import { instrument } from "@socket.io/admin-ui";
import type { Server as SocketIOServer } from "socket.io";
import { appConfig, realtimeConfig } from "@/config/index.js";

export function setupSocketAdminUI(io: SocketIOServer | null) {
  if (!io || !realtimeConfig.enabled || appConfig.environment === "production") {
    return { enabled: false };
  }

  instrument(io, {
    auth: false,
    mode: "development"
  });

  return { enabled: true };
}
