import type { DocKind, DocRow, DashboardStats } from '../types';
import { api, searchParams, withAliases } from './api';
import {
  asList,
  normalizeCategory,
  normalizeDocRow,
  normalizeLocation,
  normalizeMove,
  normalizeOperation,
  normalizeProduct,
  normalizeStats,
  normalizeStock,
  normalizeUser,
  normalizeWarehouse,
} from './normalize';

function body(payload: Record<string, unknown>): string {
  return JSON.stringify(withAliases(payload));
}

export const authApi = {
  signup(input: { loginId: string; email: string; password: string; fullName?: string }) {
    return api<{ token?: string; user?: unknown }>('/api/auth/signup', {
      method: 'POST',
      body: body(input),
    });
  },
  login(loginId: string, password: string) {
    return api<{ token: string; user: unknown }>('/api/auth/login', {
      method: 'POST',
      body: body({ loginId, password }),
    });
  },
  forgotPassword(email: string) {
    return api<{ message?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  resetPassword(email: string, otp: string, password: string) {
    return api<{ message?: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: body({ email, otp, password }),
    });
  },
};

export const profileApi = {
  async get() {
    return normalizeUser(await api('/api/profile'));
  },
  async update(fullName: string) {
    return normalizeUser(await api('/api/profile', { method: 'PUT', body: body({ fullName }) }));
  },
};

export const masterApi = {
  async products(search = '') {
    return asList(await api(`/api/products${searchParams(search)}`)).map(normalizeProduct);
  },
  async product(id: string) {
    return normalizeProduct(await api(`/api/products/${id}`));
  },
  createProduct(payload: Record<string, unknown>) {
    return api(`/api/products`, { method: 'POST', body: body(payload) }).then(normalizeProduct);
  },
  updateProduct(id: string, payload: Record<string, unknown>) {
    return api(`/api/products/${id}`, { method: 'PUT', body: body(payload) }).then(normalizeProduct);
  },
  removeProduct(id: string) {
    return api(`/api/products/${id}`, { method: 'DELETE' });
  },
  async categories() {
    return asList(await api('/api/categories')).map(normalizeCategory);
  },
  createCategory(name: string) {
    return api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }).then(normalizeCategory);
  },
  async warehouses() {
    return asList(await api('/api/warehouses')).map(normalizeWarehouse);
  },
  async warehouse(id: string) {
    return normalizeWarehouse(await api(`/api/warehouses/${id}`));
  },
  createWarehouse(payload: Record<string, unknown>) {
    return api('/api/warehouses', { method: 'POST', body: body(payload) }).then(normalizeWarehouse);
  },
  updateWarehouse(id: string, payload: Record<string, unknown>) {
    return api(`/api/warehouses/${id}`, { method: 'PUT', body: body(payload) }).then(normalizeWarehouse);
  },
  async locations(warehouseId = '') {
    const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}&warehouse_id=${encodeURIComponent(warehouseId)}` : '';
    return asList(await api(`/api/locations${qs}`)).map(normalizeLocation);
  },
  createLocation(payload: Record<string, unknown>) {
    return api('/api/locations', { method: 'POST', body: body(payload) }).then(normalizeLocation);
  },
  updateLocation(id: string, payload: Record<string, unknown>) {
    return api(`/api/locations/${id}`, { method: 'PUT', body: body(payload) }).then(normalizeLocation);
  },
};

const DOC_PATH: Record<DocKind, string> = {
  receipt: '/api/receipts',
  delivery: '/api/deliveries',
  transfer: '/api/transfers',
  adjustment: '/api/adjustments',
};

export const docsApi = {
  async list(kind: DocKind, search = '') {
    const rows = asList(await api(`${DOC_PATH[kind]}${searchParams(search)}`));
    return rows.map((row) => normalizeDocRow(row, kind));
  },
  async get(kind: DocKind, id: string) {
    return normalizeOperation(await api(`${DOC_PATH[kind]}/${id}`));
  },
  async create(kind: DocKind, payload: Record<string, unknown>) {
    return normalizeOperation(await api(DOC_PATH[kind], { method: 'POST', body: body(payload) }));
  },
  async update(kind: DocKind, id: string, payload: Record<string, unknown>) {
    return normalizeOperation(await api(`${DOC_PATH[kind]}/${id}`, { method: 'PUT', body: body(payload) }));
  },
  async action(kind: DocKind, id: string, action: 'confirm' | 'validate' | 'cancel' | 'apply') {
    return normalizeOperation(await api(`${DOC_PATH[kind]}/${id}/${action}`, { method: 'POST' }));
  },
};

export const stockApi = {
  async list(search = '') {
    return asList(await api(`/api/stock${searchParams(search)}`)).map(normalizeStock);
  },
  update(productId: string, locationId: string, onHand: number) {
    return api(`/api/stock/${productId}`, {
      method: 'PUT',
      body: body({ locationId, onHand }),
    });
  },
};

export const moveApi = {
  async list(search = '') {
    return asList(await api(`/api/move-history${searchParams(search)}`)).map(normalizeMove);
  },
};

export async function loadDashboard(filters: {
  type: string;
  status: string;
  warehouseId: string;
  locationId: string;
  categoryId: string;
}): Promise<{ stats: DashboardStats; documents: DocRow[]; totalUnits: number }> {
  const params = new URLSearchParams();
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.status) params.set('status', filters.status === 'canceled' ? 'cancelled' : filters.status);
  if (filters.warehouseId) {
    params.set('warehouseId', filters.warehouseId);
    params.set('warehouse_id', filters.warehouseId);
  }
  if (filters.locationId) {
    params.set('locationId', filters.locationId);
    params.set('location_id', filters.locationId);
  }
  if (filters.categoryId) {
    params.set('categoryId', filters.categoryId);
    params.set('category_id', filters.categoryId);
  }
  const qs = params.toString();
  const stats = normalizeStats(await api(`/api/dashboard/stats${qs ? `?${qs}` : ''}`));

  let documents = stats.documents;
  if (!documents) {
    const kinds: DocKind[] =
      filters.type === 'receipt' || filters.type === 'receipts'
        ? ['receipt']
        : filters.type === 'delivery'
          ? ['delivery']
          : filters.type === 'internal' || filters.type === 'transfer'
            ? ['transfer']
            : filters.type === 'adjustment' || filters.type === 'adjustments'
              ? ['adjustment']
              : ['receipt', 'delivery', 'transfer', 'adjustment'];
    const batches = await Promise.all(kinds.map((kind) => docsApi.list(kind)));
    documents = batches.flat();
  }

  let totalUnits = stats.totalUnits;
  if (totalUnits === null) {
    const stock = await stockApi.list();
    totalUnits = stock.reduce((sum, row) => sum + row.onHand, 0);
  }

  return { stats: { ...stats, totalUnits }, documents, totalUnits };
}
