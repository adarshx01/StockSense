const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let readToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function setTokenGetter(getter: () => string | null) {
  readToken = getter;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

const SNAKE: Record<string, string> = {
  loginId: 'login_id',
  fullName: 'full_name',
  newPassword: 'new_password',
  warehouseId: 'warehouse_id',
  receiveFrom: 'receive_from',
  destinationLocationId: 'destination_location_id',
  scheduleDate: 'schedule_date',
  sourceLocationId: 'source_location_id',
  deliveryAddress: 'delivery_address',
  operationType: 'operation_type',
  fromLocationId: 'from_location_id',
  toLocationId: 'to_location_id',
  productId: 'product_id',
  locationId: 'location_id',
  countedQty: 'counted_qty',
  recordedQty: 'recorded_qty',
  categoryId: 'category_id',
  unitOfMeasure: 'unit_of_measure',
  perUnitCost: 'per_unit_cost',
  reorderLevel: 'reorder_level',
  initialStock: 'initial_stock',
  shortCode: 'short_code',
};

/** Send camelCase (contract) and snake_case (current server) together. */
export function withAliases(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const [camel, snake] of Object.entries(SNAKE)) {
    if (out[camel] !== undefined && out[snake] === undefined) out[snake] = out[camel];
  }
  if (out.password !== undefined && out.new_password === undefined) {
    out.new_password = out.password;
  }
  if (out.onHand !== undefined) {
    if (out.new_quantity === undefined) out.new_quantity = out.onHand;
    if (out.on_hand === undefined) out.on_hand = out.onHand;
  }
  if (Array.isArray(out.lines)) {
    out.lines = (out.lines as Record<string, unknown>[]).map((line) => withAliases(line));
  }
  return out;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the StockSense API. Check that it is running.', 0);
  }

  const text = await response.text();
  let data: { error?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    const message = data?.error || response.statusText || 'Request failed';
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function searchParams(search: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set('q', search.trim());
    params.set('search', search.trim());
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
