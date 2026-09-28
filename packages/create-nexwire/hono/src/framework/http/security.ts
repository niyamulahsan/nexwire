import type { MiddlewareHandler } from "hono";
import { securityConfig } from "@/config/index.js";

/**
 * Why: Sets browser security response headers (CSP, HSTS, X-Frame).
 * When: Every incoming HTTP request.
 * Where: App middleware stack, after CORS and session.
 * How: All headers disabled when securityConfig.enabled is false.
 *      HSTS only applied when request is HTTPS.
 */
export const securityMiddleware: MiddlewareHandler = async (c, next) => {
  if (securityConfig.enabled) {
    c.header("Content-Security-Policy", securityConfig.csp);
    const proto = c.req.header("x-forwarded-proto");
    if (securityConfig.hsts && proto === "https") {
      c.header("Strict-Transport-Security", securityConfig.hstsMaxAge);
    }
    c.header("X-Frame-Options", securityConfig.xFrame);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  await next();
};
