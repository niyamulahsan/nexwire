/**
 * Why: CORS policy for the HTTP server.
 * When: Global CORS middleware processes cross-origin requests.
 * Where: src/config/cors.ts.
 * How: `origin` accepts `"*"` for any origin or a comma-separated allow-list.
 *      `"*"` reflects the request origin (required for credentialed requests).
 */
export const corsConfig = {
  origin: "*"
};

export type CorsConfig = typeof corsConfig;
