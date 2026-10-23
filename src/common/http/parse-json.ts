import { z, type ZodType } from "zod";

export type ParseResult<T> = { success: true; data: T } | { success: false; message: string };

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, message: "Request body must be valid JSON." };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Request body is invalid." };
  }
  return { success: true, data: result.data };
}

export const nonEmptyObjectSchema = z.record(z.string(), z.unknown()).refine(
  (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  "Expected a JSON object.",
);
