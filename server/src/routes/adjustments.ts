import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { parseBody } from '../utils/validate.ts';
import { searchTerm, shape, statusTerm } from '../utils/shape.ts';
import { generateReference } from '../services/referenceService.ts';
import { applyAdjustment, withTx } from '../services/inventoryService.ts';

const createSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  countedQty: z.number().min(0),
  reason: z.string().max(500).nullable().optional(),
  contact: z.string().max(255).nullable().optional(),
});

async function loadAdjustment(fastify: FastifyInstance, id: string) {
  const result = await fastify.db.query(
    `SELECT a.*, p.name AS product_name, p.sku, l.name AS location_name, l.short_code,
            w.short_code AS warehouse_code, u.full_name AS responsible_name
     FROM adjustments a
     JOIN products p ON p.id = a.product_id
     JOIN locations l ON l.id = a.location_id
     JOIN warehouses w ON w.id = l.warehouse_id
     LEFT JOIN users u ON u.id = a.responsible_id
     WHERE a.id = $1`,
    [id],
  );
  if (!result.rows[0]) throw new NotFoundError('Adjustment');
  return shape(result.rows[0]);
}

export async function adjustmentRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/adjustments', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = [];
    const search = searchTerm(query);
    const status = statusTerm(query);
    if (search) {
      params.push(`%${search}%`);
      where.push(`(a.reference ILIKE $${params.length} OR a.contact ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }
    const result = await fastify.db.query(
      `SELECT a.*, p.name AS product_name, p.sku, l.short_code, w.short_code AS warehouse_code
       FROM adjustments a
       JOIN products p ON p.id = a.product_id
       JOIN locations l ON l.id = a.location_id
       JOIN warehouses w ON w.id = l.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/adjustments/:id', staff, async (request) => loadAdjustment(fastify, (request.params as { id: string }).id));

  fastify.post('/api/adjustments', staff, async (request, reply) => {
    const body = parseBody(createSchema, request.body);
    const id = await withTx(fastify.db, async (client) => {
      const location = await client.query('SELECT warehouse_id FROM locations WHERE id = $1', [body.locationId]);
      if (!location.rows[0]) throw new NotFoundError('Location');
      const product = await client.query('SELECT id FROM products WHERE id = $1', [body.productId]);
      if (!product.rows[0]) throw new NotFoundError('Product');
      const current = await client.query(
        'SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2',
        [body.productId, body.locationId],
      );
      const recorded = current.rows[0] ? Number(current.rows[0].on_hand) : 0;
      const reference = await generateReference(client, location.rows[0].warehouse_id, 'ADJ');
      const inserted = await client.query(
        `INSERT INTO adjustments (
           reference, product_id, location_id, recorded_qty, counted_qty, delta, reason, contact, responsible_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING id`,
        [
          reference,
          body.productId,
          body.locationId,
          recorded,
          body.countedQty,
          body.countedQty - recorded,
          body.reason ?? null,
          body.contact ?? null,
          request.user.id,
        ],
      );
      return inserted.rows[0].id as string;
    });
    return reply.status(201).send(await loadAdjustment(fastify, id));
  });

  fastify.post('/api/adjustments/:id/apply', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => applyAdjustment(client, id));
    return loadAdjustment(fastify, id);
  });

  fastify.post('/api/adjustments/:id/cancel', staff, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.db.query('SELECT status FROM adjustments WHERE id = $1', [id]);
    if (!existing.rows[0]) throw new NotFoundError('Adjustment');
    if (existing.rows[0].status === 'done') throw new AppError('Done documents cannot be canceled', 400);
    const result = await fastify.db.query(
      `UPDATE adjustments SET status = 'canceled', updated_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING id`,
      [id],
    );
    if (!result.rowCount) throw new AppError('Adjustment cannot be canceled', 400);
    return loadAdjustment(fastify, id);
  });
}
