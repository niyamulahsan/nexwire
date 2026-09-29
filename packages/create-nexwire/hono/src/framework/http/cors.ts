import { cors } from "hono/cors";
import { corsConfig } from "@/config/index.js";
import { parseCsvOrFallback } from "@/framework/support/lifecycle.js";

const corsOrigins = parseCsvOrFallback(corsConfig.origin, []);

/**
 * Why: Applies credential-aware CORS policy.
 * When: Global HTTP middleware processing.
 * Where: App middleware stack.
 * How: Reflects origin for wildcard mode or validates against allowlist.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (corsConfig.origin === "*") return origin;
    return corsOrigins.includes(origin) ? origin : undefined;
  },
  credentials: true
});
