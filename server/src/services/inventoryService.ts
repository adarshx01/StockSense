import pg from 'pg';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { generateReference } from './referenceService.ts';

type Pair = { productId: string; locationId: string };

async function lockLocations(client: pg.PoolClient, locationIds: string[]): Promise<void> {
  const ids = [...new Set(locationIds)].filter(Boolean).sort();
  for (const id of ids) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
  }
}

async function lockStock(client: pg.PoolClient, pairs: Pair[]): Promise<void> {
  const unique = new Map<string, Pair>();
  for (const pair of pairs) unique.set(`${pair.locationId}:${pair.productId}`, pair);
  const ordered = [...unique.values()].sort(
    (a, b) => a.locationId.localeCompare(b.locationId) || a.productId.localeCompare(b.productId),
  );
  for (const pair of ordered) {
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand)
       VALUES ($1, $2, 0)
       ON CONFLICT (product_id, location_id) DO NOTHING`,
      [pair.productId, pair.locationId],
    );
    await client.query(
      `SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2 FOR UPDATE`,
      [pair.productId, pair.locationId],
    );
  }
}

async function onHand(client: pg.PoolClient, productId: string, locationId: string): Promise<number> {
  const result = await client.query(
    'SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2',
    [productId, locationId],
  );
  return result.rows[0] ? Number(result.rows[0].on_hand) : 0;
}

export async function freeQty(
  client: pg.PoolClient,
  productId: string,
  locationId: string,
  exclude: { deliveryId?: string; transferId?: string } = {},
): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE((
        SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2
      ), 0)
      - COALESCE((
        SELECT SUM(dl.quantity)
        FROM delivery_lines dl
        JOIN deliveries d ON d.id = dl.delivery_id
        WHERE dl.product_id = $1
          AND d.source_location_id = $2
          AND d.status IN ('waiting', 'ready')
          AND ($3::uuid IS NULL OR d.id <> $3)
      ), 0)
      - COALESCE((
        SELECT SUM(tl.quantity)
        FROM transfer_lines tl
        JOIN internal_transfers t ON t.id = tl.transfer_id
        WHERE tl.product_id = $1
          AND t.from_location_id = $2
          AND t.status IN ('waiting', 'ready')
          AND ($4::uuid IS NULL OR t.id <> $4)
      ), 0) AS free_qty`,
    [productId, locationId, exclude.deliveryId ?? null, exclude.transferId ?? null],
  );
  return Number(result.rows[0].free_qty);
}

async function locationLabel(client: pg.PoolClient, locationId: string): Promise<string> {
  const result = await client.query(
    `SELECT w.short_code || '/' || l.short_code AS label
     FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
     WHERE l.id = $1`,
    [locationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Location');
  return result.rows[0].label as string;
}

async function insertMove(
  client: pg.PoolClient,
  move: {
    reference: string;
    moveType: string;
    productId: string;
    fromLocationId: string | null;
    toLocationId: string | null;
    fromLabel: string | null;
    toLabel: string | null;
    quantity: number;
    contact: string | null;
    direction: 'IN' | 'OUT' | 'INT' | 'ADJ';
    sourceDocumentId: string;
    sourceDocumentType: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO stock_moves (
       reference, move_type, product_id, from_location_id, to_location_id,
       from_label, to_label, quantity, contact, status, direction,
       source_document_id, source_document_type
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'done',$10,$11,$12)`,
    [
      move.reference,
      move.moveType,
      move.productId,
      move.fromLocationId,
      move.toLocationId,
      move.fromLabel,
      move.toLabel,
      move.quantity,
      move.contact,
      move.direction,
      move.sourceDocumentId,
      move.sourceDocumentType,
    ],
  );
}

async function markAvailability(
  client: pg.PoolClient,
  table: 'delivery_lines' | 'transfer_lines',
  parentColumn: 'delivery_id' | 'transfer_id',
  parentId: string,
  locationId: string,
  exclude: { deliveryId?: string; transferId?: string },
): Promise<boolean> {
  const lines = await client.query(
    `SELECT id, product_id, quantity FROM ${table} WHERE ${parentColumn} = $1 ORDER BY id`,
    [parentId],
  );
  if (lines.rows.length === 0) throw new AppError('At least one line is required', 422);
  const productIds = [...new Set(lines.rows.map((line) => line.product_id as string))].sort();
  await lockStock(client, productIds.map((productId) => ({ productId, locationId })));
  const remaining = new Map<string, number>();
  let anyShort = false;
  for (const line of lines.rows) {
    const productId = line.product_id as string;
    if (!remaining.has(productId)) {
      remaining.set(productId, await freeQty(client, productId, locationId, exclude));
    }
    const free = remaining.get(productId) ?? 0;
    const qty = Number(line.quantity);
    const short = qty > free + 1e-9;
    if (short) anyShort = true;
    else remaining.set(productId, free - qty);
    await client.query(`UPDATE ${table} SET out_of_stock = $2 WHERE id = $1`, [line.id, short]);
  }
  return anyShort;
}

export async function promoteAt(client: pg.PoolClient, locationId: string): Promise<void> {
  const waiting = await client.query(
    `SELECT id, kind FROM (
       SELECT id, 'delivery'::text AS kind, created_at FROM deliveries
       WHERE source_location_id = $1 AND status = 'waiting'
       UNION ALL
       SELECT id, 'transfer', created_at FROM internal_transfers
       WHERE from_location_id = $1 AND status = 'waiting'
     ) docs
     ORDER BY created_at, id`,
    [locationId],
  );
  for (const doc of waiting.rows) {
    if (doc.kind === 'delivery') await reevaluateDelivery(client, doc.id as string);
    else await reevaluateTransfer(client, doc.id as string);
  }
}

async function reevaluateDelivery(client: pg.PoolClient, deliveryId: string): Promise<void> {
  const locked = await client.query(
    `SELECT id, source_location_id, status FROM deliveries WHERE id = $1 FOR UPDATE`,
    [deliveryId],
  );
  if (!locked.rows[0] || locked.rows[0].status !== 'waiting') return;
  const anyShort = await markAvailability(client, 'delivery_lines', 'delivery_id', deliveryId, locked.rows[0].source_location_id, {
    deliveryId,
  });
  if (!anyShort) {
    await client.query(`UPDATE deliveries SET status = 'ready', updated_at = NOW() WHERE id = $1`, [deliveryId]);
  }
}

async function reevaluateTransfer(client: pg.PoolClient, transferId: string): Promise<void> {
  const locked = await client.query(
    `SELECT id, from_location_id, status FROM internal_transfers WHERE id = $1 FOR UPDATE`,
    [transferId],
  );
  if (!locked.rows[0] || locked.rows[0].status !== 'waiting') return;
  const anyShort = await markAvailability(client, 'transfer_lines', 'transfer_id', transferId, locked.rows[0].from_location_id, {
    transferId,
  });
  if (!anyShort) {
    await client.query(`UPDATE internal_transfers SET status = 'ready', updated_at = NOW() WHERE id = $1`, [transferId]);
  }
}

export async function confirmReceipt(client: pg.PoolClient, receiptId: string): Promise<void> {
  const existing = await client.query('SELECT destination_location_id, status FROM receipts WHERE id = $1', [receiptId]);
  if (!existing.rows[0]) throw new NotFoundError('Receipt');
  await lockLocations(client, [existing.rows[0].destination_location_id]);
  const locked = await client.query('SELECT status FROM receipts WHERE id = $1 FOR UPDATE', [receiptId]);
  if (locked.rows[0].status !== 'draft') throw new AppError('Receipt is not draft', 400);
  const lines = await client.query('SELECT 1 FROM receipt_lines WHERE receipt_id = $1', [receiptId]);
  if (!lines.rowCount) throw new AppError('At least one line is required', 422);
  const updated = await client.query(
    `UPDATE receipts SET status = 'ready', updated_at = NOW() WHERE id = $1 AND status = 'draft' RETURNING id`,
    [receiptId],
  );
  if (!updated.rowCount) throw new AppError('Receipt is not draft', 400);
}

export async function validateReceipt(client: pg.PoolClient, receiptId: string): Promise<void> {
  const existing = await client.query(
    `SELECT id, reference, destination_location_id, contact, status FROM receipts WHERE id = $1`,
    [receiptId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Receipt');
  const receipt = existing.rows[0];
  const lines = await client.query(
    'SELECT product_id, quantity FROM receipt_lines WHERE receipt_id = $1 ORDER BY id',
    [receiptId],
  );
  if (!lines.rowCount) throw new AppError('At least one line is required', 422);
  await lockLocations(client, [receipt.destination_location_id]);
  await lockStock(
    client,
    lines.rows.map((line) => ({ productId: line.product_id as string, locationId: receipt.destination_location_id as string })),
  );
  const posted = await client.query(
    `UPDATE receipts SET status = 'done', updated_at = NOW()
     WHERE id = $1 AND status = 'ready' RETURNING id`,
    [receiptId],
  );
  if (!posted.rowCount) throw new AppError('Already posted or not ready', 409);

  const toLabel = await locationLabel(client, receipt.destination_location_id);
  for (const line of lines.rows) {
    await client.query(
      `UPDATE stock_levels SET on_hand = on_hand + $3, updated_at = NOW()
       WHERE product_id = $1 AND location_id = $2`,
      [line.product_id, receipt.destination_location_id, line.quantity],
    );
    await insertMove(client, {
      reference: receipt.reference,
      moveType: 'receipt',
      productId: line.product_id,
      fromLocationId: null,
      toLocationId: receipt.destination_location_id,
      fromLabel: receipt.contact || 'vendor',
      toLabel,
      quantity: Number(line.quantity),
      contact: receipt.contact,
      direction: 'IN',
      sourceDocumentId: receiptId,
      sourceDocumentType: 'receipt',
    });
  }
  await promoteAt(client, receipt.destination_location_id);
}

export async function confirmDelivery(client: pg.PoolClient, deliveryId: string): Promise<string> {
  const existing = await client.query('SELECT source_location_id, status FROM deliveries WHERE id = $1', [deliveryId]);
  if (!existing.rows[0]) throw new NotFoundError('Delivery');
  await lockLocations(client, [existing.rows[0].source_location_id]);
  const locked = await client.query('SELECT source_location_id, status FROM deliveries WHERE id = $1 FOR UPDATE', [deliveryId]);
  if (locked.rows[0].status !== 'draft') throw new AppError('Delivery is not draft', 400);
  const anyShort = await markAvailability(
    client,
    'delivery_lines',
    'delivery_id',
    deliveryId,
    locked.rows[0].source_location_id,
    { deliveryId },
  );
  const status = anyShort ? 'waiting' : 'ready';
  await client.query('UPDATE deliveries SET status = $2, updated_at = NOW() WHERE id = $1', [deliveryId, status]);
  return status;
}

export async function validateDelivery(client: pg.PoolClient, deliveryId: string): Promise<void> {
  const existing = await client.query(
    `SELECT id, reference, source_location_id, contact, status FROM deliveries WHERE id = $1`,
    [deliveryId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Delivery');
  const delivery = existing.rows[0];
  const lines = await client.query(
    'SELECT product_id, quantity FROM delivery_lines WHERE delivery_id = $1 ORDER BY id',
    [deliveryId],
  );
  if (!lines.rowCount) throw new AppError('At least one line is required', 422);
  await lockLocations(client, [delivery.source_location_id]);
  await lockStock(
    client,
    lines.rows.map((line) => ({ productId: line.product_id as string, locationId: delivery.source_location_id as string })),
  );
  const posted = await client.query(
    `UPDATE deliveries SET status = 'done', updated_at = NOW()
     WHERE id = $1 AND status = 'ready' RETURNING id`,
    [deliveryId],
  );
  if (!posted.rowCount) throw new AppError('Already posted or not ready', 409);

  const fromLabel = await locationLabel(client, delivery.source_location_id);
  for (const line of lines.rows) {
    const decreased = await client.query(
      `UPDATE stock_levels SET on_hand = on_hand - $3, updated_at = NOW()
       WHERE product_id = $1 AND location_id = $2 AND on_hand >= $3
       RETURNING on_hand`,
      [line.product_id, delivery.source_location_id, line.quantity],
    );
    if (!decreased.rowCount) throw new AppError('Insufficient stock to validate delivery', 422);
    await insertMove(client, {
      reference: delivery.reference,
      moveType: 'delivery',
      productId: line.product_id,
      fromLocationId: delivery.source_location_id,
      toLocationId: null,
      fromLabel,
      toLabel: delivery.contact || 'customer',
      quantity: Number(line.quantity),
      contact: delivery.contact,
      direction: 'OUT',
      sourceDocumentId: deliveryId,
      sourceDocumentType: 'delivery',
    });
  }
}

export async function confirmTransfer(client: pg.PoolClient, transferId: string): Promise<string> {
  const existing = await client.query(
    'SELECT from_location_id, to_location_id, status FROM internal_transfers WHERE id = $1',
    [transferId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Transfer');
  await lockLocations(client, [existing.rows[0].from_location_id, existing.rows[0].to_location_id]);
  const locked = await client.query(
    'SELECT from_location_id, status FROM internal_transfers WHERE id = $1 FOR UPDATE',
    [transferId],
  );
  if (locked.rows[0].status !== 'draft') throw new AppError('Transfer is not draft', 400);
  const anyShort = await markAvailability(
    client,
    'transfer_lines',
    'transfer_id',
    transferId,
    locked.rows[0].from_location_id,
    { transferId },
  );
  const status = anyShort ? 'waiting' : 'ready';
  await client.query('UPDATE internal_transfers SET status = $2, updated_at = NOW() WHERE id = $1', [transferId, status]);
  return status;
}

export async function validateTransfer(client: pg.PoolClient, transferId: string): Promise<void> {
  const existing = await client.query(
    `SELECT id, reference, from_location_id, to_location_id, contact, status
     FROM internal_transfers WHERE id = $1`,
    [transferId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Transfer');
  const transfer = existing.rows[0];
  const lines = await client.query(
    'SELECT product_id, quantity FROM transfer_lines WHERE transfer_id = $1 ORDER BY id',
    [transferId],
  );
  if (!lines.rowCount) throw new AppError('At least one line is required', 422);
  await lockLocations(client, [transfer.from_location_id, transfer.to_location_id]);
  const pairs: Pair[] = [];
  for (const line of lines.rows) {
    pairs.push({ productId: line.product_id, locationId: transfer.from_location_id });
    pairs.push({ productId: line.product_id, locationId: transfer.to_location_id });
  }
  await lockStock(client, pairs);
  const posted = await client.query(
    `UPDATE internal_transfers SET status = 'done', updated_at = NOW()
     WHERE id = $1 AND status = 'ready' RETURNING id`,
    [transferId],
  );
  if (!posted.rowCount) throw new AppError('Already posted or not ready', 409);

  const fromLabel = await locationLabel(client, transfer.from_location_id);
  const toLabel = await locationLabel(client, transfer.to_location_id);
  for (const line of lines.rows) {
    const decreased = await client.query(
      `UPDATE stock_levels SET on_hand = on_hand - $3, updated_at = NOW()
       WHERE product_id = $1 AND location_id = $2 AND on_hand >= $3
       RETURNING on_hand`,
      [line.product_id, transfer.from_location_id, line.quantity],
    );
    if (!decreased.rowCount) throw new AppError('Insufficient stock to validate transfer', 422);
    await client.query(
      `UPDATE stock_levels SET on_hand = on_hand + $3, updated_at = NOW()
       WHERE product_id = $1 AND location_id = $2`,
      [line.product_id, transfer.to_location_id, line.quantity],
    );
    await insertMove(client, {
      reference: transfer.reference,
      moveType: 'transfer',
      productId: line.product_id,
      fromLocationId: transfer.from_location_id,
      toLocationId: transfer.to_location_id,
      fromLabel,
      toLabel,
      quantity: Number(line.quantity),
      contact: transfer.contact,
      direction: 'INT',
      sourceDocumentId: transferId,
      sourceDocumentType: 'transfer',
    });
  }
  await promoteAt(client, transfer.to_location_id);
}

export async function applyAdjustment(client: pg.PoolClient, adjustmentId: string): Promise<void> {
  const existing = await client.query(
    `SELECT a.id, a.reference, a.product_id, a.location_id, a.counted_qty, a.contact, a.reason, a.status
     FROM adjustments a WHERE a.id = $1`,
    [adjustmentId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Adjustment');
  const adj = existing.rows[0];
  await lockLocations(client, [adj.location_id]);
  await lockStock(client, [{ productId: adj.product_id, locationId: adj.location_id }]);
  const posted = await client.query(
    `UPDATE adjustments SET status = 'done', updated_at = NOW()
     WHERE id = $1 AND status = 'draft' RETURNING id`,
    [adjustmentId],
  );
  if (!posted.rowCount) throw new AppError('Already posted or not draft', 409);

  const recorded = await onHand(client, adj.product_id, adj.location_id);
  const counted = Number(adj.counted_qty);
  const delta = counted - recorded;
  await client.query(
    'UPDATE adjustments SET recorded_qty = $2, delta = $3, updated_at = NOW() WHERE id = $1',
    [adjustmentId, recorded, delta],
  );
  await client.query(
    `UPDATE stock_levels SET on_hand = $3, updated_at = NOW()
     WHERE product_id = $1 AND location_id = $2`,
    [adj.product_id, adj.location_id, counted],
  );
  const label = await locationLabel(client, adj.location_id);
  await insertMove(client, {
    reference: adj.reference,
    moveType: 'adjustment',
    productId: adj.product_id,
    fromLocationId: adj.location_id,
    toLocationId: adj.location_id,
    fromLabel: label,
    toLabel: label,
    quantity: delta,
    contact: adj.contact || adj.reason,
    direction: 'ADJ',
    sourceDocumentId: adjustmentId,
    sourceDocumentType: 'adjustment',
  });
  if (delta > 0) await promoteAt(client, adj.location_id);
}

export async function createAndApplyAdjustment(
  client: pg.PoolClient,
  input: {
    productId: string;
    locationId: string;
    countedQty: number;
    reason?: string | null;
    contact?: string | null;
    userId: string;
  },
): Promise<string> {
  const location = await client.query('SELECT warehouse_id FROM locations WHERE id = $1', [input.locationId]);
  if (!location.rows[0]) throw new NotFoundError('Location');
  const product = await client.query('SELECT id FROM products WHERE id = $1', [input.productId]);
  if (!product.rows[0]) throw new NotFoundError('Product');
  const reference = await generateReference(client, location.rows[0].warehouse_id, 'ADJ');
  const inserted = await client.query(
    `INSERT INTO adjustments (
       reference, product_id, location_id, recorded_qty, counted_qty, delta, reason, contact, responsible_id, status
     ) VALUES ($1,$2,$3,0,$4,0,$5,$6,$7,'draft')
     RETURNING id`,
    [reference, input.productId, input.locationId, input.countedQty, input.reason ?? null, input.contact ?? null, input.userId],
  );
  await applyAdjustment(client, inserted.rows[0].id);
  return inserted.rows[0].id as string;
}

export async function withTx<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
