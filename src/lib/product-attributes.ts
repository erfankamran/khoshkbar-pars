export interface ProductAttribute {
  key: string;
  value: string;
}

/** Read current properties and the compact names used by old data and APIs. */
export function parseProductAttributes(raw: string | null | undefined): ProductAttribute[] {
  if (!raw) return [];

  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];

    const fields = entry as Record<string, unknown>;
    const key = typeof fields.key === 'string' ? fields.key : fields.k;
    const value = typeof fields.value === 'string' ? fields.value : fields.v;

    if (typeof key !== 'string' || typeof value !== 'string') return [];
    if (!key.trim() || !value.trim()) return [];
    return [{ key: key.trim(), value: value.trim() }];
  });
}
