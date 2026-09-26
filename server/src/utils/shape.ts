const NUMERIC = new Set([
  'on_hand',
  'quantity',
  'per_unit_cost',
  'reorder_level',
  'recorded_qty',
  'counted_qty',
  'delta',
  'free_to_use',
  'total_stock',
  'initial_stock',
]);

export function shape<T = Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    if (value instanceof Date) {
      out[camel] = value.toISOString();
    } else if (value !== null && value !== undefined && NUMERIC.has(key)) {
      out[camel] = Number(value);
    } else {
      out[camel] = value;
    }
  }
  return out;
}

export function camelizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(camelizeKeys);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[camel] = camelizeKeys(value);
    }
    return out;
  }
  return input;
}
