import { OpenAPIHono } from "@hono/zod-openapi";
import { defaultHook } from "stoker/openapi";

export type NexwireRouter = OpenAPIHono & {
  group: (...middlewares: any[]) => NexwireRouter;
  api: (route: any, handlerOrMiddlewares: any, handler?: any) => NexwireRouter;
};

/**
 * Why: Creates the framework router with OpenAPI + helper methods.
 * When: Building root app and module route files.
 * Where: HTTP app bootstrap and route stubs.
 * How: Wraps OpenAPIHono and adds group/api convenience APIs.
 *
 * group() records its middlewares here instead of calling this.use("*", mw).
 * A use("*") is a route entry: mounting the router copies it and "*" rewrites
 * to the mount prefix, so a limiter declared on one sub-router also ran for its
 * siblings and for every route added after the mount. Recorded middlewares are
 * merged into each .api() call instead, so they travel with the routes they
 * were declared on and reach nothing else.
 */
export function createRouter(): NexwireRouter {
  const router = new OpenAPIHono({ strict: false, defaultHook }) as NexwireRouter;
  const baseOpenapi = router.openapi.bind(router);

  // Store group middlewares on the instance
  const groupMiddlewares: any[] = [];

  router.group = function (...middlewares) {
    // Accumulate group middlewares (supports multiple .group() calls)
    for (const middleware of middlewares) {
      groupMiddlewares.push(middleware);
    }
    return this;
  };

  router.api = function (route: any, handlerOrMiddlewares: any, handler?: any) {
    // Normalize arguments:
    //   .api(route, handler)                      → [groupMiddlewares], handler
    //   .api(route, [mw1, mw2], handler)          → [groupMiddlewares, mw1, mw2], handler
    let routeMiddlewares: any[] = [];
    let finalHandler: any;

    if (!Array.isArray(handlerOrMiddlewares)) {
      finalHandler = handlerOrMiddlewares;
    } else {
      routeMiddlewares = handlerOrMiddlewares;
      finalHandler = handler;
    }

    // Combine: group middleware runs first, then route middleware
    const allMiddlewares = [...groupMiddlewares, ...routeMiddlewares];

    if (typeof finalHandler !== "function") {
      throw new Error("api(route, middlewares, handler) requires a handler function");
    }

    // No middleware at all → simple pass-through
    if (allMiddlewares.length === 0) {
      baseOpenapi(route, finalHandler);
      return this;
    }

    // Wrap middleware chain into the handler — travels with the route,
    // no matter where the router is mounted.
    const wrappedHandler = async (c: any) => {
      let index = 0;

      const next = async (): Promise<any> => {
        if (index < allMiddlewares.length) {
          const middleware = allMiddlewares[index++];
          let downstream: any;
          const result = await middleware(c, async () => {
            downstream = await next();
            return downstream;
          });
          return result === undefined ? downstream : result;
        }
        return await finalHandler(c);
      };

      return await next();
    };

    baseOpenapi(route, wrappedHandler);
    return this;
  };

  return router;
}

/**
 * Shorthand for creating a router with group middleware pre-applied.
 */
export function group(...middlewares: any[]) {
  return createRouter().group(...middlewares);
}
