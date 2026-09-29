import { appConfig } from "./app.js";

/**
 * Why: OpenAPI documentation settings — API metadata and Scalar UI presentation.
 * When: OPEN_API=true during app boot.
 * Where: src/config/openapi.ts.
 * How: Edit this file to customise your API title, version, description,
 *      and the Scalar docs UI appearance.
 */
export const openApiConfig = {
  /** OpenAPI spec version */
  version: "3.0.0",

  /** API title shown in docs and the /doc spec */
  title: `${appConfig.name} API`,

  /** API version shown in docs */
  apiVersion: "1.0.0",

  /** Optional description shown in the /doc spec */
  description: "",

  /** Scalar docs UI settings */
  scalar: {
    /** URL path to the OpenAPI JSON spec */
    specUrl: "/doc",

    /** URL path to the interactive docs UI */
    docsPath: "/api-docs",

    /** UI layout: "classic" or "modern" */
    layout: "classic" as const,

    /** UI theme: "default", "moon", "purple", "solarized", "bluePlanet", "fastify", "kepler", "mars", "nebula", "none" */
    theme: "moon" as const,

    /** HTML page title for the /api-docs page */
    pageTitle: `${appConfig.name} API`,

    /** Favicon file (project-relative) served at /favicon.ico for the /api-docs page */
    favicon: "src/resources/src/assets/images/favicon/favicon.ico",

    /** Default HTTP client shown in code examples */
    defaultHttpClient: {
      targetKey: "js" as const,
      clientKey: "fetch" as const
    },

    /** Expand all tags on load */
    defaultOpenAllTags: true
  }
} as const;

export type OpenApiConfig = typeof openApiConfig;
