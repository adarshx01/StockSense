import { FastifyInstance } from 'fastify';

const TYPE_MAP: Record<string, string> = {
  receipt: 'receipt',
  receipts: 'receipt',
  delivery: 'delivery',
  deliveries: 'delivery',
  transfer: 'transfer',
  transfers: 'transfer',
  internal: 'transfer',
  adjustment: 'adjustment',
  adjustments: 'adjustment',
};

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/dashboard/stats',
    { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') },
    async (request) => {
      const query = request.query as Record<string, string | undefined>;
      const warehouseId = query.warehouseId ?? null;
      const locationId = query.locationId ?? null;
      const categoryId = query.categoryId ?? null;
      const status = query.status === 'cancelled' ? 'canceled' : (query.status ?? null);
      const type = query.type ? TYPE_MAP[query.type] ?? query.type : null;

      const stock = await fastify.db.query(
        `SELECT
           COALESCE(SUM(scoped.total), 0)::float8 AS total_units,
           (COUNT(*) FILTER (WHERE scoped.total <= p.reorder_level))::int AS low_stock_count,
           (COUNT(*) FILTER (WHERE scoped.total = 0))::int AS out_of_stock_count
         FROM products p
         JOIN LATERAL (
           SELECT COALESCE(SUM(sl.on_hand), 0) AS total
           FROM stock_levels sl
           JOIN locations l ON l.id = sl.location_id
           WHERE sl.product_id = p.id
             AND ($1::uuid IS NULL OR l.warehouse_id = $1)
             AND ($2::uuid IS NULL OR sl.location_id = $2)
         ) scoped ON true
         WHERE ($3::uuid IS NULL OR p.category_id = $3)`,
        [warehouseId, locationId, categoryId],
      );

      const receiptCard = await fastify.db.query(
        `SELECT
           (COUNT(*) FILTER (WHERE r.status = 'ready'))::int AS to_receive,
           (COUNT(*) FILTER (WHERE r.status NOT IN ('done', 'canceled') AND r.schedule_date < CURRENT_DATE))::int AS late,
           (COUNT(*) FILTER (WHERE r.status NOT IN ('done', 'canceled') AND r.schedule_date > CURRENT_DATE))::int AS operations,
           (COUNT(*) FILTER (WHERE r.status NOT IN ('done', 'canceled')))::int AS pending
         FROM receipts r
         WHERE ($1::uuid IS NULL OR r.warehouse_id = $1)
           AND ($2::uuid IS NULL OR r.destination_location_id = $2)
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM receipt_lines rl
             JOIN products p ON p.id = rl.product_id
             WHERE rl.receipt_id = r.id AND p.category_id = $3
           ))`,
        [warehouseId, locationId, categoryId],
      );

      const deliveryCard = await fastify.db.query(
        `SELECT
           (COUNT(*) FILTER (WHERE d.status = 'ready'))::int AS to_deliver,
           (COUNT(*) FILTER (WHERE d.status NOT IN ('done', 'canceled') AND d.schedule_date < CURRENT_DATE))::int AS late,
           (COUNT(*) FILTER (WHERE d.status = 'waiting'))::int AS waiting,
           (COUNT(*) FILTER (WHERE d.status NOT IN ('done', 'canceled') AND d.schedule_date > CURRENT_DATE))::int AS operations,
           (COUNT(*) FILTER (WHERE d.status NOT IN ('done', 'canceled')))::int AS pending
         FROM deliveries d
         WHERE ($1::uuid IS NULL OR d.warehouse_id = $1)
           AND ($2::uuid IS NULL OR d.source_location_id = $2)
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM delivery_lines dl
             JOIN products p ON p.id = dl.product_id
             WHERE dl.delivery_id = d.id AND p.category_id = $3
           ))`,
        [warehouseId, locationId, categoryId],
      );

      const transfers = await fastify.db.query(
        `SELECT COUNT(*)::int AS scheduled
         FROM internal_transfers t
         WHERE t.status NOT IN ('done', 'canceled')
           AND ($1::uuid IS NULL OR t.warehouse_id = $1)
           AND ($2::uuid IS NULL OR t.from_location_id = $2 OR t.to_location_id = $2)
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM transfer_lines tl
             JOIN products p ON p.id = tl.product_id
             WHERE tl.transfer_id = t.id AND p.category_id = $3
           ))`,
        [warehouseId, locationId, categoryId],
      );

      const documents = await fastify.db.query(
        `SELECT * FROM (
           SELECT r.id, 'receipt'::text AS type, r.reference, r.status, r.contact, r.schedule_date,
                  r.warehouse_id, r.destination_location_id AS location_id, r.created_at
           FROM receipts r
           WHERE ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM receipt_lines rl JOIN products p ON p.id = rl.product_id
             WHERE rl.receipt_id = r.id AND p.category_id = $3
           ))
           UNION ALL
           SELECT d.id, 'delivery', d.reference, d.status, d.contact, d.schedule_date,
                  d.warehouse_id, d.source_location_id, d.created_at
           FROM deliveries d
           WHERE ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM delivery_lines dl JOIN products p ON p.id = dl.product_id
             WHERE dl.delivery_id = d.id AND p.category_id = $3
           ))
           UNION ALL
           SELECT t.id, 'transfer', t.reference, t.status, t.contact, t.schedule_date,
                  t.warehouse_id, t.from_location_id, t.created_at
           FROM internal_transfers t
           WHERE ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM transfer_lines tl JOIN products p ON p.id = tl.product_id
             WHERE tl.transfer_id = t.id AND p.category_id = $3
           ))
           UNION ALL
           SELECT a.id, 'adjustment', a.reference, a.status, a.contact, NULL::date,
                  l.warehouse_id, a.location_id, a.created_at
           FROM adjustments a
           JOIN locations l ON l.id = a.location_id
           JOIN products p ON p.id = a.product_id
           WHERE ($3::uuid IS NULL OR p.category_id = $3)
         ) docs
         WHERE ($1::uuid IS NULL OR warehouse_id = $1)
           AND ($2::uuid IS NULL OR location_id = $2 OR (type = 'transfer' AND EXISTS (
             SELECT 1 FROM internal_transfers t WHERE t.id = docs.id AND (t.from_location_id = $2 OR t.to_location_id = $2)
           )))
           AND ($4::text IS NULL OR type = $4)
           AND ($5::text IS NULL OR status = $5)
         ORDER BY created_at DESC
         LIMIT 200`,
        [warehouseId, locationId, categoryId, type, status],
      );

      const stockRow = stock.rows[0];
      const receiptRow = receiptCard.rows[0];
      const deliveryRow = deliveryCard.rows[0];
      return {
        totalUnits: Number(stockRow.total_units),
        lowStockCount: Number(stockRow.low_stock_count),
        outOfStockCount: Number(stockRow.out_of_stock_count),
        pendingReceipts: Number(receiptRow.pending),
        pendingDeliveries: Number(deliveryRow.pending),
        internalTransfersScheduled: Number(transfers.rows[0].scheduled),
        receiptCard: {
          toReceive: Number(receiptRow.to_receive),
          late: Number(receiptRow.late),
          operations: Number(receiptRow.operations),
        },
        deliveryCard: {
          toDeliver: Number(deliveryRow.to_deliver),
          late: Number(deliveryRow.late),
          waiting: Number(deliveryRow.waiting),
          operations: Number(deliveryRow.operations),
        },
        documents: documents.rows.map((row) => ({
          id: row.id,
          type: row.type,
          reference: row.reference,
          status: row.status,
          contact: row.contact,
          scheduleDate: row.schedule_date,
          warehouseId: row.warehouse_id,
          locationId: row.location_id,
        })),
      };
    },
  );
}
