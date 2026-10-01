import type { z } from "zod";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head" | "trace";

export type RouteConfig = {
  path: string;
  method: HttpMethod;
  tags?: string[];
  summary?: string;
  description?: string;
  request?: {
    params?: z.ZodType;
    query?: z.ZodType;
    headers?: z.ZodType;
    cookies?: z.ZodType;
    body?: { content: { "application/json": { schema: z.ZodType } }; description?: string };
  };
  responses: Record<number | string, { description?: string; content?: { "application/json": { schema: z.ZodType } } }>;
};
