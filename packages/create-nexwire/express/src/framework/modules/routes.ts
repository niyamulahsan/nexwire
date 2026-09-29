import type { Express } from "express";
import { registerRouterOpenApi } from "@/framework/http/router.js";
import { discoverModuleFiles, importFile, moduleNameFromPath } from "@/framework/modules/discover.js";

export async function registerModuleRoutes(app: Express) {
  const files = await discoverModuleFiles("**/routes/*.{ts,js}");

  for (const file of files) {
    const route = await importFile(file);

    if (!route.default) {
      throw new Error(`Route file ${file} has no default export`);
    }

    const prefix = `/api/${moduleNameFromPath(file)}`;
    registerRouterOpenApi(route.default, prefix);
    app.use(prefix, route.default);
  }

  return files.length;
}
