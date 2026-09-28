import { createRoute, z } from "@hono/zod-openapi";
import { appConfig, redisConfig } from "@/config/index.js";
import { database } from "@/framework/database/connection.js";
import { corsMiddleware } from "@/framework/http/cors.js";
import { loggerMiddleware, notFound, onError } from "@/framework/http/logger.js";
import { getMetrics, incrementRequestCount } from "@/framework/http/metrics.js";
import { configureOpenApi } from "@/framework/http/openapi.js";
import { rateLimiterMiddleware } from "@/framework/http/ratelimiter.js";
import { createRouter } from "@/framework/http/router.js";
import { securityMiddleware } from "@/framework/http/security.js";
import { hasUiBuild, storageStaticMiddleware } from "@/framework/http/static.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { sessionMiddleware } from "@/framework/session/session.js";

/**
 * Why: Builds the main HTTP app with middleware, health, and error handlers.
 * When: Kernel creates application server instance.
 * Where: Framework bootstrap path.
 * How: Composes router, optional OpenAPI, middleware stack, and fallbacks.
 */
export function createHttpApp() {
  const app = createRouter();

  const healthRoute = createRoute({
    path: "/health",
    method: "get",
    tags: ["System"],
    responses: {
      200: {
        description: "Application health status",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() })
          }
        }
      }
    }
  });

  if (appConfig.openApiEnabled) {
    configureOpenApi(app);
    app.api(healthRoute, (c: any) => c.json({ message: "Application is healthy" }));
  }

  app.use("*", sessionMiddleware);
  app.use("*", corsMiddleware);
  app.use("*", securityMiddleware);
  app.use("*", async (_c, next) => {
    incrementRequestCount();
    await next();
  });
  app.use("*", loggerMiddleware);
  app.use("*", rateLimiterMiddleware);
  app.use("/storage/*", storageStaticMiddleware);

  app.get("/ready", (c) => {
    const checks: Record<string, string> = {};
    let allOk = true;
    try {
      database();
      checks["database"] = "ok";
    } catch {
      checks["database"] = "error";
      allOk = false;
    }
    if (redisConfig.enabled) {
      if (redisClientIfReady()) {
        checks["redis"] = "ok";
      } else {
        checks["redis"] = "error";
        allOk = false;
      }
    } else {
      checks["redis"] = "disabled";
    }
    const status = allOk ? 200 : 503;
    return c.json({ status: allOk ? "ready" : "not_ready", checks }, status);
  });

  app.get("/live", (c) => {
    return c.json({ status: "alive" });
  });

  app.get("/metrics", (c) => {
    const m = getMetrics();
    const output = [
      "# HELP http_requests_total Total HTTP requests",
      "# TYPE http_requests_total counter",
      `http_requests_total ${m.requestCount}`,
      "# HELP http_errors_total Total HTTP errors",
      "# TYPE http_errors_total counter",
      `http_errors_total ${m.errorCount}`
    ].join("\n");
    return c.body(output, 200, { "content-type": "text/plain" });
  });

  if (!hasUiBuild()) {
    app.get("/", (c: any) => c.json({ name: appConfig.name, ok: true }));
  }

  if (!appConfig.openApiEnabled) {
    app.get("/health", (c: any) => c.json({ message: "Application is healthy" }));
  }

  app.notFound(notFound);
  app.onError(onError);

  return app;
}
