import { NextFunction, Request, Response } from "express";
import { securityConfig } from "@/config/index.js";

/**
 * Why: Sets browser security response headers (CSP, HSTS, X-Frame).
 * When: Every incoming HTTP request.
 * Where: App middleware stack, after CORS and session.
 * How: All headers disabled when securityConfig.enabled is false.
 *      HSTS only applied when request is HTTPS.
 */
export const securityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (securityConfig.enabled) {
    res.set("Content-Security-Policy", securityConfig.csp);
    const proto = req.headers["x-forwarded-proto"];
    if (securityConfig.hsts && (proto === "https" || req.secure)) {
      res.set("Strict-Transport-Security", securityConfig.hstsMaxAge);
    }
    res.set("X-Frame-Options", securityConfig.xFrame);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  next();
};
