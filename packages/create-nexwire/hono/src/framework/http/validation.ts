import type { z } from "zod";

/**
 * Why: Centralizes schema validation with consistent error shape.
 * When: Non-route code needs explicit Zod validation.
 * Where: Controllers/helpers/services.
 * How: Runs safeParseAsync and throws 422 payload on failure.
 */
export async function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): Promise<z.infer<T>> {
  const result = await schema.safeParseAsync(data);

  if (!result.success) {
    throw {
      status: 422,
      message: "Validation failed",
      errors: result.error.flatten()
    };
  }

  return result.data;
}
