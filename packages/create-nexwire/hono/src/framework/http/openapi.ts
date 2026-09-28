import fs from "node:fs";
import path from "node:path";
import { Scalar } from "@scalar/hono-api-reference";
import { openApiConfig } from "@/config/index.js";
import type { NexwireRouter } from "@/framework/http/router.js";

/**
 * Why: Registers OpenAPI document and interactive docs UI.
 * When: OPEN_API is enabled during app boot.
 * Where: HTTP app setup.
 * How: Exposes `/doc` spec and `/api-docs` Scalar viewer.
 */
export function configureOpenApi(app: NexwireRouter) {
  app.doc("/doc", {
    openapi: openApiConfig.version,
    info: {
      title: openApiConfig.title,
      version: openApiConfig.apiVersion,
      ...(openApiConfig.description ? { description: openApiConfig.description } : {})
    }
  });

  if (openApiConfig.scalar.favicon) {
    app.get("/favicon.ico", (c) => {
      const faviconPath = path.join(process.cwd(), openApiConfig.scalar.favicon);
      if (!fs.existsSync(faviconPath)) return c.notFound();
      return c.body(fs.readFileSync(faviconPath), 200, { "content-type": "image/x-icon" });
    });
  }

  app.get(
    openApiConfig.scalar.docsPath,
    Scalar({
      url: openApiConfig.scalar.specUrl,
      layout: openApiConfig.scalar.layout,
      theme: openApiConfig.scalar.theme,
      pageTitle: openApiConfig.scalar.pageTitle,
      defaultHttpClient: openApiConfig.scalar.defaultHttpClient,
      defaultOpenAllTags: openApiConfig.scalar.defaultOpenAllTags
    })
  );
}
