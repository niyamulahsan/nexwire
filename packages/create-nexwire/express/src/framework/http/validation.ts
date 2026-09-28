import createError from "http-errors";
import type { z } from "zod";

export async function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): Promise<z.infer<T>> {
  const result = await schema.safeParseAsync(data);

  if (!result.success) {
    throw createError(422, "Validation failed", {
      success: false,
      error: {
        name: result.error.name,
        issues: result.error.issues
      }
    } as never);
  }

  return result.data;
}
