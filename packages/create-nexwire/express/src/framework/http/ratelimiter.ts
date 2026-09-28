import { rateLimit } from "express-rate-limit";
import { rateLimitConfig } from "@/config/index.js";

export const rateLimiterMiddleware = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  limit: rateLimitConfig.maxRequests,
  standardHeaders: "draft-7",
  legacyHeaders: true
});

export const loginLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  limit: rateLimitConfig.loginMaxRequests,
  standardHeaders: "draft-7",
  legacyHeaders: true
});
