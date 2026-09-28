import { randomUUID } from "node:crypto";
import jwtLib from "jsonwebtoken";
import { jwtConfig } from "@/config/index.js";

export const jwt = {
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
    const token = await jwtLib.sign(tokenPayload, secret, { algorithm: jwtConfig.algorithm });

    return { token, jti, exp };
  },

  async verifyToken(token: string, type: "access" | "refresh") {
    try {
      const secret = type === "refresh" ? jwtConfig.refreshSecret : jwtConfig.accessSecret;
      const payload = (await jwtLib.verify(token, secret, { algorithms: [jwtConfig.algorithm] })) as Record<string, unknown>;
      return payload.type === type ? payload : null;
    } catch {
      return null;
    }
  }
};
