import { randomUUID } from "node:crypto";
import { sign, verify } from "hono/jwt";
import { jwtConfig } from "@/config/index.js";

export const jwt = {
  /**
   * Why: Creates signed JWT access/refresh tokens with project claims.
   * When: Auth flows issue or rotate credentials.
   * Where: Auth controllers/helpers.
   * How: Builds payload with iat/exp/type (+jti for refresh) and signs HS256.
   */
  async generateToken(payload: any, type: "access" | "refresh", expirySeconds?: number) {
    const now = Math.floor(Date.now() / 1000);
    const exp =
      now +
      (typeof expirySeconds === "number"
        ? expirySeconds
        : type === "refresh"
          ? jwtConfig.refreshExpirySeconds
          : jwtConfig.accessExpirySeconds);
    const secret = type === "refresh" ? jwtConfig.refreshSecret : jwtConfig.accessSecret;
    const jti = type === "refresh" ? randomUUID() : undefined;

    const tokenPayload = { ...payload, type, iat: now, exp, ...(jti ? { jti } : {}) };
    const token = await sign(tokenPayload, secret, jwtConfig.algorithm);

    return { token, jti, exp };
  },

  /**
   * Why: Validates JWT and enforces token type.
   * When: Middleware and refresh flows verify credentials.
   * Where: Auth and realtime handshake.
   * How: Verifies signature/expiry with type-specific secret and checks payload type.
   */
  async verifyToken(token: string, type: "access" | "refresh") {
    try {
      const secret = type === "refresh" ? jwtConfig.refreshSecret : jwtConfig.accessSecret;
      const payload = await verify(token, secret, jwtConfig.algorithm);
      return payload.type === type ? payload : null;
    } catch {
      return null;
    }
  }
};
