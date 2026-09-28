import cookieParser from "cookie-parser";
import express from "express";
import { z } from "zod";
import { appConfig, cookieConfig, loggingConfig, redisConfig } from "@/config/index.js";
import { database } from "@/framework/database/connection.js";
import { corsMiddleware } from "@/framework/http/cors.js";
import { loggerMiddleware } from "@/framework/http/logger.js";
import { getMetrics, incrementRequestCount } from "@/framework/http/metrics.js";
import { configureOpenApi, registerOpenApiRoute } from "@/framework/http/openapi.js";
import { rateLimiterMiddleware } from "@/framework/http/ratelimiter.js";
import { createRoute, jsonContent } from "@/framework/http/router.js";
import { securityMiddleware } from "@/framework/http/security.js";
import { hasUiBuild, storageStaticMiddleware } from "@/framework/http/static.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { sessionMiddleware } from "@/framework/session/session.js";

export function createHttpApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(cookieConfig.secret));
  app.use(corsMiddleware);
  app.use(sessionMiddleware);
  app.use(securityMiddleware);

  app.use((_req, _res, next) => {
    incrementRequestCount();
    next();
  });

  app.get("/ready", (_req, res) => {
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
    res.status(status).json({ status: allOk ? "ready" : "not_ready", checks });
  });

  app.get("/live", (_req, res) => {
    res.json({ status: "alive" });
  });

  app.get("/metrics", (_req, res) => {
    const m = getMetrics();
    const output = [
      "# HELP http_requests_total Total HTTP requests",
      "# TYPE http_requests_total counter",
      `http_requests_total ${m.requestCount}`,
      "# HELP http_errors_total Total HTTP errors",
      "# TYPE http_errors_total counter",
      `http_errors_total ${m.errorCount}`
    ].join("\n");
    res.type("text/plain").status(200).send(output);
  });

  if (loggingConfig.httpRequests) {
    app.use(loggerMiddleware);
  }

  app.use(rateLimiterMiddleware);

  if (appConfig.openApiEnabled) {
    configureOpenApi(app);
    registerOpenApiRoute(
      createRoute({
        path: "/health",
        method: "get",
        tags: ["System"],
        responses: {
          200: jsonContent(z.object({ message: z.string() }), "Application health status")
        }
      })
    );
  }

  app.get("/health", (_req, res) => {
    res.json({ message: "Application is healthy" });
  });

  if (!hasUiBuild()) {
    app.get("/", (_req, res) => {
      res.json({ name: appConfig.name, ok: true });
    });
  }

  app.use("/storage", storageStaticMiddleware);

  return app;
}
