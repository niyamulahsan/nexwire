import type { Router as ExpressRouter, RequestHandler } from "express";
import express from "express";
import type { z } from "zod";
import { registerOpenApiRoute } from "@/framework/http/openapi.js";
import type { HttpMethod, RouteConfig } from "@/framework/http/types.js";
import { validate } from "@/framework/http/validation.js";

export type { HttpMethod, RouteConfig };

export type NexwireRouter = Omit<ExpressRouter, "route"> & {
  group: (...middlewares: RequestHandler[]) => NexwireRouter;
  api: (route: RouteConfig, handlerOrMiddlewares: RequestHandler[] | RequestHandler, handler?: RequestHandler) => NexwireRouter;
  route: {
    (prefix: string, child: NexwireRouter): NexwireRouter;
    (prefix: string): any;
  };
};

export function createRoute<T extends RouteConfig>(config: T): T {
  return config;
}

export const jsonContent = <T extends z.ZodType>(schema: T, description: string) => ({
  content: {
    "application/json": {
      schema
    }
  },
  description
});

type RouterState = {
  routes: RouteConfig[];
  children: Array<{ prefix: string; router: NexwireRouter }>;
};

const states = new WeakMap<object, RouterState>();

function stateOf(router: object) {
  let state = states.get(router);
  if (!state) {
    state = { routes: [], children: [] };
    states.set(router, state);
  }
  return state;
}

function joinPaths(prefix: string, path: string) {
  if (!prefix || prefix === "/") return path || "/";
  if (!path || path === "/") return prefix;
  return `${prefix.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function expressPath(path: string) {
  return path
    .replace(/\{\*([^}]+)\}/g, "/*$1")
    .replace(/\{([^}]+)\}/g, ":$1")
    .replace(/\/{2,}/g, "/");
}

function setRequestPart(target: any, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true
  });
}

function validationMiddleware(route: RouteConfig): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (req.params) {
        for (const key of Object.keys(req.params)) {
          if (Array.isArray(req.params[key])) {
            req.params[key] = (req.params[key] as string[]).join('/');
          }
        }
      }
      if (route.request?.params) {
        setRequestPart(req, "params", await validate(route.request.params, req.params));
      }
      if (route.request?.query) {
        setRequestPart(req, "query", await validate(route.request.query, req.query));
      }
      if (route.request?.headers) {
        await validate(route.request.headers, req.headers);
      }
      if (route.request?.cookies) {
        await validate(route.request.cookies, req.cookies);
      }
      if (route.request?.body) {
        const bodySchema = route.request.body.content?.["application/json"]?.schema;
        if (bodySchema) {
          setRequestPart(req, "body", await validate(bodySchema, req.body));
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function collectRoutes(router: object, prefix = ""): RouteConfig[] {
  const state = states.get(router);
  if (!state) return [];

  const routes: RouteConfig[] = [];
  for (const child of state.children) {
    routes.push(...collectRoutes(child.router, joinPaths(prefix, child.prefix)));
  }
  for (const route of state.routes) {
    routes.push({ ...route, path: joinPaths(prefix, route.path) });
  }
  return routes;
}

export function registerRouterOpenApi(router: object, prefix = "") {
  for (const route of collectRoutes(router, prefix)) {
    registerOpenApiRoute(route);
  }
}

export function createRouter(): NexwireRouter {
  const router = express.Router() as unknown as NexwireRouter;
  const nativeRoute = router.route.bind(router);
  states.set(router, { routes: [], children: [] });

  // Group middlewares are kept here rather than registered with router.use(),
  // because a catch-all use() also matches requests whose route lives in a
  // sibling router or in the parent. They are merged into every .api() call
  // instead, so they travel with the routes they were declared on.
  const groupMiddlewares: RequestHandler[] = [];

  router.group = function (...middlewares: RequestHandler[]) {
    for (const middleware of middlewares) {
      groupMiddlewares.push(middleware);
    }
    return this;
  };

  router.api = function (route: RouteConfig, handlerOrMiddlewares: RequestHandler[] | RequestHandler, handler?: RequestHandler) {
    const middlewares = Array.isArray(handlerOrMiddlewares) ? handlerOrMiddlewares : [];
    const finalHandler = Array.isArray(handlerOrMiddlewares) ? handler : handlerOrMiddlewares;

    if (typeof finalHandler !== "function") {
      throw new Error("api(route, middlewares, handler) requires a handler function");
    }

    (router as any)[route.method](
      expressPath(route.path),
      validationMiddleware(route),
      ...groupMiddlewares,
      ...middlewares,
      finalHandler
    );
    stateOf(router).routes.push(route);
    return this;
  };

  router.route = function (prefix: string, child?: NexwireRouter) {
    if (child === undefined) {
      return nativeRoute(prefix) as any;
    }

    router.use(prefix, child as any);
    stateOf(router).children.push({ prefix, router: child });
    return this;
  };

  return router;
}

export function group(...middlewares: RequestHandler[]) {
  return createRouter().group(...middlewares);
}
