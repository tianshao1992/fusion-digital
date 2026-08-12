export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function stringifyJson(value: JsonValue = {}): string {
  return JSON.stringify(value);
}

export function parseJsonObject(value: string): Record<string, JsonValue> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Stored JSON value is not an object");
  }
  return parsed as Record<string, JsonValue>;
}
