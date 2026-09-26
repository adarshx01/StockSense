import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.ts';
import { createAndApplyAdjustment, withTx } from '../services/inventoryService.ts';

export async function stockRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/stock', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const search = query.search;
    const params: unknown[] = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE p.name ILIKE $1 OR p.sku ILIKE $1`;
    }
    const products = await fastify.db.query(
      `SELECT p.id, p.name, p.sku, p.per_unit_cost, p.uom, p.reorder_level,
              COALESCE(stock.on_hand, 0)::float8 AS on_hand,
              (COALESCE(stock.on_hand, 0) - COALESCE(reserved.qty, 0))::float8 AS free_to_use
       FROM products p
       LEFT JOIN (
         SELECT product_id, SUM(on_hand) AS on_hand FROM stock_levels GROUP BY product_id
       ) stock ON stock.product_id = p.id
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS qty FROM (
           SELECT dl.product_id, dl.quantity
           FROM delivery_lines dl
           JOIN deliveries d ON d.id = dl.delivery_id
           WHERE d.status IN ('waiting', 'ready')
           UNION ALL
           SELECT tl.product_id, tl.quantity
           FROM transfer_lines tl
           JOIN internal_transfers t ON t.id = tl.transfer_id
           WHERE t.status IN ('waiting', 'ready')
         ) moves
         GROUP BY product_id
       ) reserved ON reserved.product_id = p.id
       ${where}
       ORDER BY p.name`,
      params,
    );
    const levels = await fastify.db.query(
      `SELECT sl.product_id, sl.location_id, l.name AS location_name, l.short_code,
              w.short_code AS warehouse_code, sl.on_hand::float8 AS on_hand,
              (sl.on_hand - COALESCE(dr.qty, 0) - COALESCE(tr.qty, 0))::float8 AS free_to_use
       FROM stock_levels sl
       JOIN locations l ON l.id = sl.location_id
       JOIN warehouses w ON w.id = l.warehouse_id
       LEFT JOIN (
         SELECT d.source_location_id AS location_id, dl.product_id, SUM(dl.quantity) AS qty
         FROM delivery_lines dl
         JOIN deliveries d ON d.id = dl.delivery_id
         WHERE d.status IN ('waiting', 'ready')
         GROUP BY d.source_location_id, dl.product_id
       ) dr ON dr.location_id = sl.location_id AND dr.product_id = sl.product_id
       LEFT JOIN (
         SELECT t.from_location_id AS location_id, tl.product_id, SUM(tl.quantity) AS qty
         FROM transfer_lines tl
         JOIN internal_transfers t ON t.id = tl.transfer_id
         WHERE t.status IN ('waiting', 'ready')
         GROUP BY t.from_location_id, tl.product_id
       ) tr ON tr.location_id = sl.location_id AND tr.product_id = sl.product_id`,
    );
    const byProduct = new Map<string, unknown[]>();
    for (const level of levels.rows) {
      const list = byProduct.get(level.product_id) ?? [];
      list.push({
        locationId: level.location_id,
        locationName: level.location_name,
        label: `${level.warehouse_code}/${level.short_code}`,
        onHand: Number(level.on_hand),
        freeToUse: Number(level.free_to_use),
      });
      byProduct.set(level.product_id, list);
    }
    return products.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      sku: row.sku,
      perUnitCost: Number(row.per_unit_cost),
      uom: row.uom,
      reorderLevel: Number(row.reorder_level),
      onHand: Number(row.on_hand),
      freeToUse: Number(row.free_to_use),
      locations: byProduct.get(row.id) ?? [],
    }));
  });

  fastify.put('/api/stock/:productId', staff, async (request) => {
    const { productId } = request.params as { productId: string };
    const body = parseBody(
      z.object({
        locationId: z.string().uuid(),
        onHand: z.number().min(0),
      }),
      request.body,
    );
    const adjustmentId = await withTx(fastify.db, (client) =>
      createAndApplyAdjustment(client, {
        productId,
        locationId: body.locationId,
        countedQty: body.onHand,
        reason: 'Stock page correction',
        userId: request.user.id,
      }),
    );
    const adjustment = await fastify.db.query('SELECT * FROM adjustments WHERE id = $1', [adjustmentId]);
    const level = await fastify.db.query(
      'SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2',
      [productId, body.locationId],
    );
    return {
      adjustmentId,
      reference: adjustment.rows[0].reference,
      recordedQty: Number(adjustment.rows[0].recorded_qty),
      countedQty: Number(adjustment.rows[0].counted_qty),
      delta: Number(adjustment.rows[0].delta),
      onHand: Number(level.rows[0]?.on_hand ?? 0),
    };
  });
}
