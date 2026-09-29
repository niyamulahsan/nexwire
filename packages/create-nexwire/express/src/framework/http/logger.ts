import type { ErrorRequestHandler, RequestHandler } from "express";
import createError from "http-errors";
import { logger } from "@/framework/support/logger.js";

function requestIp(req: Parameters<RequestHandler>[0]) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(req.headers["cf-connecting-ip"] || forwarded || req.headers["x-real-ip"] || req.socket.remoteAddress || "");
}

export const loggerMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  res.on("finish", () => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/health" || pathname.startsWith("/queues")) return;

    logger.info("HTTP Request", {
      requestId,
      method: req.method,
      path: pathname,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
      ip: requestIp(req),
      userAgent: req.headers["user-agent"] || null
    });
  });

  next();
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(createError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const onError: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.status === "number" ? error.status : 500;

  if (error?.success === false && error?.error?.issues) {
    logger.warn("Request validation failed", {
      status,
      issues: error.error.issues
    });
    res.status(status).json({
      success: false,
      error: {
        name: error.error.name ?? "ZodError",
        issues: error.error.issues
      }
    });
    return;
  }

  const message = status === 500 && !error?.expose ? "Internal server error" : (error?.message ?? "Internal server error");
  const stack = process.env.NODE_ENV === "production" ? undefined : error?.stack;
  logger.error("Request failed", {
    status,
    message,
    stack: error?.stack
  });
  res.status(status).json({
    message,
    ...(stack ? { stack } : {})
  });
};
