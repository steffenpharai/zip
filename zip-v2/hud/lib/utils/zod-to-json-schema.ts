import { z } from "zod";

// Simple Zod to JSON Schema converter
// This is a basic implementation; for production, consider using zod-to-json-schema library
export function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      if (value instanceof z.ZodOptional) {
        properties[key] = zodToJsonSchema(value._def.innerType);
      } else if (value instanceof z.ZodDefault) {
        properties[key] = zodToJsonSchema(value._def.innerType);
      } else {
        properties[key] = zodToJsonSchema(value as z.ZodSchema);
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema._def.type),
    };
  }

  // Fallback for unknown types
  return { type: "object" };
}

