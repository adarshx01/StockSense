import type { DocStatus } from '../types';

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function firstNum(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function str(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

export function formatRs(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${text} Rs`;
}

export function formatQty(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function formatDate(value: unknown): string {
  const text = str(value);
  if (!text) return '—';
  return text.slice(0, 10);
}

export function toDateInput(value: unknown): string {
  const text = str(value);
  return text ? text.slice(0, 10) : '';
}

export function formatRole(role: string): string {
  if (role === 'inventory_manager') return 'Inventory Manager';
  if (role === 'warehouse_staff') return 'Warehouse Staff';
  return role.replaceAll('_', ' ') || '—';
}

export function displayUser(name: string, loginId: string): string {
  return name.trim() || loginId || '—';
}

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft',
  waiting: 'Waiting',
  ready: 'Ready',
  done: 'Done',
  canceled: 'Canceled',
};

export function normalizeStatus(value: unknown): DocStatus {
  const s = str(value).toLowerCase();
  if (s === 'cancelled' || s === 'canceled') return 'canceled';
  if (s === 'waiting' || s === 'ready' || s === 'done' || s === 'draft') return s;
  return 'draft';
}

export function kindLabel(kind: string): string {
  if (kind === 'receipt') return 'Receipt';
  if (kind === 'delivery') return 'Delivery';
  if (kind === 'transfer' || kind === 'internal') return 'Internal';
  if (kind === 'adjustment') return 'Adjustment';
  return kind;
}

export function moveTone(reference: string, moveType: string): 'in' | 'out' | 'int' | 'adj' {
  const ref = reference.toUpperCase();
  const type = moveType.toLowerCase();
  if (ref.includes('/ADJ/') || type.includes('adjust')) return 'adj';
  if (ref.includes('/INT/') || type.includes('transfer') || type.includes('internal')) return 'int';
  if (ref.includes('/OUT/') || type.includes('delivery')) return 'out';
  if (ref.includes('/IN/') || type.includes('receipt')) return 'in';
  return 'int';
}

const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export function passwordChecks(password: string, confirm: string) {
  return [
    { ok: password.length > 8, text: 'Longer than 8 characters' },
    { ok: /[a-z]/.test(password), text: 'At least one lowercase letter' },
    { ok: /[A-Z]/.test(password), text: 'At least one uppercase letter' },
    { ok: SPECIAL.test(password), text: 'At least one special character' },
    { ok: password.length > 0 && password === confirm, text: 'Re-entered password matches' },
  ];
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
