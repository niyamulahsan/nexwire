import type { Socket } from "socket.io";
import { cookieConfig } from "@/config/index.js";
import type { RealtimeAuthContext } from "@/framework/realtime/types.js";
import { jwt } from "@/framework/support/jwt.js";

export function unauthenticatedRealtimeAuth(): RealtimeAuthContext {
  return { isAuthenticated: false, userId: null, roles: [], payload: null };
}

function parseCookieHeader(header: string | undefined) {
  if (!header) return {} as Record<string, string>;

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function userIdFromPayload(payload: Record<string, unknown>) {
  const candidate = payload.userId ?? payload.id ?? payload.sub;
  if (candidate === null || candidate === undefined) return null;
  return String(candidate);
}

function rolesFromPayload(payload: Record<string, unknown>) {
  const direct = payload.roles;
  if (Array.isArray(direct)) return direct.map((role) => String(role));

  const single = payload.role;
  if (single === null || single === undefined) return [];
  return [String(single)];
}

/**
 * Why: Resolves auth context for websocket connections from cookies.
 * When: Socket.IO handshake middleware executes.
 * Where: Realtime server auth pipeline.
 * How: Parses access cookie, verifies JWT, then normalizes user/role claims.
 */
export async function authFromSocketHandshake(socket: Socket): Promise<RealtimeAuthContext> {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const rawToken = cookies[`${cookieConfig.name}_access`];

  if (!rawToken) {
    return unauthenticatedRealtimeAuth();
  }

  // Strip Hono's signed-cookie HMAC signature (last .<base64> part appended by setSignedCookie)
  const token = rawToken.lastIndexOf(".") > 0 ? rawToken.substring(0, rawToken.lastIndexOf(".")) : rawToken;

  const payload = await jwt.verifyToken(token, "access");
  if (!payload) {
    return unauthenticatedRealtimeAuth();
  }

  const normalizedPayload = payload as Record<string, unknown>;

  return {
    isAuthenticated: true,
    userId: userIdFromPayload(normalizedPayload),
    roles: rolesFromPayload(normalizedPayload),
    payload: normalizedPayload
  };
}
