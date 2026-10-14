/** Shared input validation for configuration, rule packs, and waiver policies. */
export function requireRecord(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    throw new Error(`${location} must be an object/table`);
  }
  return value as Record<string, unknown>;
}

export function assertKnownKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  location: string,
): void {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) throw new Error(`unknown key ${location}.${key}`);
  }
}

export function requireString(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${location} must be a non-empty string`);
  }
  return value;
}

export function requireStringArray(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${location} must be a non-empty string array`);
  }
  return value.map((item, index) => requireString(item, `${location}[${index}]`));
}
