export type DocStatus = 'draft' | 'waiting' | 'ready' | 'done' | 'canceled';

export type DocKind = 'receipt' | 'delivery' | 'transfer' | 'adjustment';

export interface User {
  id: string;
  loginId: string;
  email: string;
  fullName: string;
  role: string;
}

export interface ProductLine {
  id?: string;
  productId: string;
  productName?: string;
  sku?: string;
  quantity: number;
  outOfStock?: boolean;
}

export interface StockAtLocation {
  locationId: string;
  locationName: string;
  locationShortCode: string;
  warehouseName: string;
  warehouseShortCode: string;
  onHand: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unitOfMeasure: string;
  perUnitCost: number;
  reorderLevel: number;
  totalStock: number;
  stockByLocation: StockAtLocation[];
}

export interface Category {
  id: string;
  name: string;
}

export interface Warehouse {
  id: string;
  name: string;
  shortCode: string;
  address: string;
  locationCount: number;
}

export interface Location {
  id: string;
  name: string;
  shortCode: string;
  warehouseId: string;
  warehouseName: string;
  warehouseShortCode: string;
  display: string;
}

export interface OperationDoc {
  id: string;
  reference: string;
  status: DocStatus;
  contact: string;
  scheduleDate: string;
  responsibleName: string;
  warehouseId: string;
  lines: ProductLine[];
  receiveFrom: string;
  destinationLocationId: string;
  toDisplay: string;
  sourceLocationId: string;
  fromDisplay: string;
  deliveryAddress: string;
  operationType: string;
  fromLocationId: string;
  toLocationId: string;
  productId: string;
  productName: string;
  sku: string;
  locationId: string;
  locationName: string;
  recordedQty: number | null;
  countedQty: number | null;
  delta: number | null;
  reason: string;
}

export interface DocRow {
  id: string;
  kind: DocKind;
  reference: string;
  from: string;
  to: string;
  contact: string;
  scheduleDate: string;
  status: DocStatus;
  warehouseId: string;
  locationIds: string[];
  productId: string;
  productName: string;
  locationName: string;
  recordedQty: number | null;
  countedQty: number | null;
  delta: number | null;
  reason: string;
}

export interface MoveRow {
  id: string;
  reference: string;
  date: string;
  contact: string;
  from: string;
  to: string;
  quantity: number;
  status: DocStatus;
  productName: string;
  sku: string;
  moveType: string;
  direction: string;
}

export interface StockRow {
  id: string;
  name: string;
  sku: string;
  perUnitCost: number;
  onHand: number;
  freeToUse: number;
  unitOfMeasure: string;
  locations: StockAtLocation[];
}

export interface DashboardStats {
  totalUnits: number | null;
  lowStockCount: number;
  outOfStockCount: number;
  pendingReceipts: number;
  pendingDeliveries: number;
  internalTransfersScheduled: number;
  receiptCard: { toReceive: number; late: number; operations: number };
  deliveryCard: { toDeliver: number; late: number; waiting: number; operations: number };
  documents: DocRow[] | null;
}
