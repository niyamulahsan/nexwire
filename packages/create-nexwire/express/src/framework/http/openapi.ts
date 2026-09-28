import fs from "node:fs";
import path from "node:path";
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { apiReference } from "@scalar/express-api-reference";
import type { Express } from "express";
import { z } from "zod";
import { openApiConfig } from "@/config/index.js";
import type { RouteConfig } from "@/framework/http/router.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

export function registerOpenApiRoute(route: RouteConfig) {
  registry.registerPath(route as any);
}

export function createOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: openApiConfig.version,
    info: {
      title: openApiConfig.title,
      version: openApiConfig.apiVersion,
      ...(openApiConfig.description ? { description: openApiConfig.description } : {})
    }
  });
}

export function configureOpenApi(app: Express) {
  app.get(openApiConfig.scalar.specUrl, (_req, res) => {
    res.json(createOpenApiDocument());
  });

  if (openApiConfig.scalar.favicon) {
    app.get("/favicon.ico", (_req, res) => {
      const faviconPath = path.join(process.cwd(), openApiConfig.scalar.favicon);
      if (!fs.existsSync(faviconPath)) return res.status(404).end();
      res.type("image/x-icon").sendFile(faviconPath);
    });
  }

  app.get(
    openApiConfig.scalar.docsPath,
    apiReference({
      url: openApiConfig.scalar.specUrl,
      layout: openApiConfig.scalar.layout,
      theme: openApiConfig.scalar.theme,
      pageTitle: openApiConfig.scalar.pageTitle,
      defaultHttpClient: openApiConfig.scalar.defaultHttpClient,
      defaultOpenAllTags: openApiConfig.scalar.defaultOpenAllTags
    } as any)
  );
}
