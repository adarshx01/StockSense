import { firstNum, formatDate, normalizeStatus, num, str } from '../lib/format';
import type {
  Category,
  DashboardStats,
  DocKind,
  DocRow,
  Location,
  MoveRow,
  OperationDoc,
  Product,
  ProductLine,
  StockAtLocation,
  StockRow,
  User,
  Warehouse,
} from '../types';

type Raw = Record<string, unknown>;

function asRaw(value: unknown): Raw {
  return value && typeof value === 'object' ? (value as Raw) : {};
}

export function asList(value: unknown): Raw[] {
  if (Array.isArray(value)) return value.map(asRaw);
  const raw = asRaw(value);
  for (const key of ['data', 'items', 'rows', 'documents', 'results']) {
    if (Array.isArray(raw[key])) return (raw[key] as unknown[]).map(asRaw);
  }
  return [];
}

export function normalizeUser(value: unknown): User {
  const raw = asRaw(value);
  return {
    id: str(raw.id),
    loginId: str(raw.loginId ?? raw.login_id),
    email: str(raw.email),
    fullName: str(raw.fullName ?? raw.full_name),
    role: str(raw.role),
  };
}

export function normalizeLine(value: unknown): ProductLine {
  const raw = asRaw(value);
  return {
    id: str(raw.id) || undefined,
    productId: str(raw.productId ?? raw.product_id),
    productName: str(raw.productName ?? raw.product_name) || undefined,
    sku: str(raw.sku) || undefined,
    quantity: num(raw.quantity),
    outOfStock: Boolean(raw.outOfStock ?? raw.out_of_stock),
  };
}

function linesOf(raw: Raw): ProductLine[] {
  return Array.isArray(raw.lines) ? raw.lines.map(normalizeLine) : [];
}

export function normalizeOperation(value: unknown): OperationDoc {
  const raw = asRaw(value);
  return {
    id: str(raw.id),
    reference: str(raw.reference),
    status: normalizeStatus(raw.status),
    contact: str(raw.contact),
    scheduleDate: formatDate(raw.scheduleDate ?? raw.schedule_date) === '—'
      ? ''
      : str(raw.scheduleDate ?? raw.schedule_date).slice(0, 10),
    responsibleName: str(raw.responsibleName ?? raw.responsible_name ?? raw.responsible_login),
    warehouseId: str(raw.warehouseId ?? raw.warehouse_id),
    lines: linesOf(raw),
    receiveFrom: str(raw.receiveFrom ?? raw.receive_from),
    destinationLocationId: str(raw.destinationLocationId ?? raw.destination_location_id),
    toDisplay: str(raw.toDisplay ?? raw.to_display ?? raw.destination_name),
    sourceLocationId: str(raw.sourceLocationId ?? raw.source_location_id),
    fromDisplay: str(raw.fromDisplay ?? raw.from_display ?? raw.source_name),
    deliveryAddress: str(raw.deliveryAddress ?? raw.delivery_address),
    operationType: str(raw.operationType ?? raw.operation_type),
    fromLocationId: str(raw.fromLocationId ?? raw.from_location_id),
    toLocationId: str(raw.toLocationId ?? raw.to_location_id),
    productId: str(raw.productId ?? raw.product_id),
    productName: str(raw.productName ?? raw.product_name),
    sku: str(raw.sku),
    locationId: str(raw.locationId ?? raw.location_id),
    locationName: str(raw.locationName ?? raw.location_name ?? raw.location_short_code),
    recordedQty: firstNum(raw.recordedQty, raw.recorded_qty),
    countedQty: firstNum(raw.countedQty, raw.counted_qty),
    delta: firstNum(raw.delta),
    reason: str(raw.reason),
  };
}

export function normalizeStockLocation(value: unknown): StockAtLocation {
  const raw = asRaw(value);
  return {
    locationId: str(raw.locationId ?? raw.location_id ?? raw.id),
    locationName: str(raw.locationName ?? raw.location_name ?? raw.name),
    locationShortCode: str(raw.locationShortCode ?? raw.location_short_code ?? raw.short_code),
    warehouseName: str(raw.warehouseName ?? raw.warehouse_name),
    warehouseShortCode: str(raw.warehouseShortCode ?? raw.warehouse_short_code),
    onHand: num(raw.onHand ?? raw.on_hand),
  };
}

export function normalizeProduct(value: unknown): Product {
  const raw = asRaw(value);
  const locations = raw.stockByLocation ?? raw.stock_by_location ?? raw.locations;
  return {
    id: str(raw.id),
    name: str(raw.name),
    sku: str(raw.sku),
    categoryId: str(raw.categoryId ?? raw.category_id),
    categoryName: str(raw.categoryName ?? raw.category_name),
    unitOfMeasure: str(raw.unitOfMeasure ?? raw.unit_of_measure) || 'Units',
    perUnitCost: num(raw.perUnitCost ?? raw.per_unit_cost),
    reorderLevel: num(raw.reorderLevel ?? raw.reorder_level),
    totalStock: num(raw.totalStock ?? raw.total_stock),
    stockByLocation: Array.isArray(locations) ? locations.map(normalizeStockLocation) : [],
  };
}

export function normalizeCategory(value: unknown): Category {
  const raw = asRaw(value);
  return { id: str(raw.id), name: str(raw.name) };
}

export function normalizeWarehouse(value: unknown): Warehouse {
  const raw = asRaw(value);
  return {
    id: str(raw.id),
    name: str(raw.name),
    shortCode: str(raw.shortCode ?? raw.short_code),
    address: str(raw.address),
    locationCount: num(raw.locationCount ?? raw.location_count),
  };
}

export function normalizeLocation(value: unknown): Location {
  const raw = asRaw(value);
  const warehouseShortCode = str(raw.warehouseShortCode ?? raw.warehouse_short_code);
  const shortCode = str(raw.shortCode ?? raw.short_code);
  return {
    id: str(raw.id),
    name: str(raw.name),
    shortCode,
    warehouseId: str(raw.warehouseId ?? raw.warehouse_id),
    warehouseName: str(raw.warehouseName ?? raw.warehouse_name),
    warehouseShortCode,
    display: warehouseShortCode && shortCode ? `${warehouseShortCode}/${shortCode}` : shortCode || str(raw.name),
  };
}

export function normalizeStock(value: unknown): StockRow {
  const raw = asRaw(value);
  const locations = raw.locations ?? raw.stockByLocation ?? raw.stock_by_location;
  return {
    id: str(raw.id ?? raw.productId ?? raw.product_id),
    name: str(raw.name ?? raw.productName ?? raw.product_name),
    sku: str(raw.sku),
    perUnitCost: num(raw.perUnitCost ?? raw.per_unit_cost),
    onHand: num(raw.onHand ?? raw.on_hand),
    freeToUse: num(raw.freeToUse ?? raw.free_to_use),
    unitOfMeasure: str(raw.unitOfMeasure ?? raw.unit_of_measure),
    locations: Array.isArray(locations) ? locations.map(normalizeStockLocation) : [],
  };
}

export function normalizeMove(value: unknown): MoveRow {
  const raw = asRaw(value);
  return {
    id: str(raw.id),
    reference: str(raw.reference),
    date: str(raw.date ?? raw.created_at ?? raw.createdAt),
    contact: str(raw.contact),
    from: str(raw.from ?? raw.from_display ?? raw.fromDisplay),
    to: str(raw.to ?? raw.to_display ?? raw.toDisplay),
    quantity: num(raw.quantity),
    status: normalizeStatus(raw.status),
    productName: str(raw.productName ?? raw.product_name),
    sku: str(raw.sku),
    moveType: str(raw.moveType ?? raw.move_type ?? raw.source_document_type),
    direction: str(raw.direction),
  };
}

function docKind(value: unknown): DocKind {
  const s = str(value).toLowerCase();
  if (s.includes('deliver')) return 'delivery';
  if (s.includes('transfer') || s === 'internal') return 'transfer';
  if (s.includes('adjust')) return 'adjustment';
  return 'receipt';
}

export function normalizeDocRow(value: unknown, fallbackKind?: DocKind): DocRow {
  const raw = asRaw(value);
  const kind = fallbackKind ?? docKind(raw.type ?? raw.kind ?? raw.documentType ?? raw.document_type);
  const locationIds = [
    str(raw.destinationLocationId ?? raw.destination_location_id),
    str(raw.sourceLocationId ?? raw.source_location_id),
    str(raw.fromLocationId ?? raw.from_location_id),
    str(raw.toLocationId ?? raw.to_location_id),
    str(raw.locationId ?? raw.location_id),
  ].filter(Boolean);

  const warehouseCode = str(raw.warehouseCode ?? raw.warehouse_code ?? raw.warehouse_short_code);
  const place = (display: string, short: string) => {
    if (display) return display;
    if (warehouseCode && short) return `${warehouseCode}/${short}`;
    return short;
  };
  const from =
    str(raw.receiveFrom ?? raw.receive_from) ||
    place(str(raw.from ?? raw.fromDisplay ?? raw.from_display), str(raw.from_short_code));
  const to =
    str(raw.deliveryAddress ?? raw.delivery_address) ||
    place(
      str(raw.to ?? raw.toDisplay ?? raw.to_display),
      str(raw.to_short_code ?? raw.destination_short_code),
    );

  return {
    id: str(raw.id),
    kind,
    reference: str(raw.reference),
    from,
    to,
    contact: str(raw.contact),
    scheduleDate: str(raw.scheduleDate ?? raw.schedule_date).slice(0, 10),
    status: normalizeStatus(raw.status),
    warehouseId: str(raw.warehouseId ?? raw.warehouse_id),
    locationIds,
    productId: str(raw.productId ?? raw.product_id),
    productName: str(raw.productName ?? raw.product_name),
    locationName: str(raw.locationName ?? raw.location_name ?? raw.location_short_code),
    recordedQty: firstNum(raw.recordedQty, raw.recorded_qty),
    countedQty: firstNum(raw.countedQty, raw.counted_qty),
    delta: firstNum(raw.delta),
    reason: str(raw.reason),
  };
}

export function normalizeStats(value: unknown): DashboardStats {
  const raw = asRaw(value);
  const receipt = asRaw(raw.receiptCard ?? raw.receipt);
  const delivery = asRaw(raw.deliveryCard ?? raw.delivery);
  const products = asRaw(raw.products);
  const transfers = asRaw(raw.transfers);
  const documents = raw.documents;

  return {
    totalUnits: firstNum(raw.totalUnits, raw.total_units, products.totalUnits, products.total_units),
    lowStockCount: num(raw.lowStockCount ?? raw.low_stock_count ?? products.lowStock ?? products.low_stock),
    outOfStockCount: num(
      raw.outOfStockCount ?? raw.out_of_stock_count ?? products.outOfStock ?? products.out_of_stock,
    ),
    pendingReceipts: num(raw.pendingReceipts ?? raw.pending_receipts ?? receipt.pending),
    pendingDeliveries: num(raw.pendingDeliveries ?? raw.pending_deliveries ?? delivery.pending),
    internalTransfersScheduled: num(
      raw.internalTransfersScheduled ??
        raw.internal_transfers_scheduled ??
        transfers.pending ??
        transfers.scheduled,
    ),
    receiptCard: {
      toReceive: num(receipt.toReceive ?? receipt.to_receive),
      late: num(receipt.late),
      operations: num(receipt.operations),
    },
    deliveryCard: {
      toDeliver: num(delivery.toDeliver ?? delivery.to_deliver),
      late: num(delivery.late),
      waiting: num(delivery.waiting),
      operations: num(delivery.operations),
    },
    documents: Array.isArray(documents) ? documents.map((row) => normalizeDocRow(row)) : null,
  };
}
