import { env } from "@/env.js";

/**
 * Why: JWT signing and lifetime settings.
 * When: Access/refresh token generation and verification.
 * Where: src/config/jwt.ts.
 * How: Signing secrets are confidential and stay in .env. Expiries are plain
 *      literals you can tune here (seconds).
 */
export const jwtConfig = {
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessExpirySeconds: 900,
  refreshExpirySeconds: 3600,
  refreshRememberExpirySeconds: 2592000,
  algorithm: "HS256" as const
};

export type JwtConfig = typeof jwtConfig;
