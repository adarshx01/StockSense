import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { dateSchema, lineSchema, parseBody } from '../utils/validate.ts';
import { searchTerm, shape, statusTerm } from '../utils/shape.ts';
import { generateReference } from '../services/referenceService.ts';
import { confirmDelivery, validateDelivery, withTx } from '../services/inventoryService.ts';

const writeSchema = z.object({
  warehouseId: z.string().uuid(),
  sourceLocationId: z.string().uuid(),
  deliveryAddress: z.string().max(500).nullable().optional(),
  contact: z.string().max(255).nullable().optional(),
  scheduleDate: dateSchema,
  operationType: z.string().max(50).nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

async function loadDelivery(fastify: FastifyInstance, id: string) {
  const delivery = await fastify.db.query(
    `SELECT d.*, u.full_name AS responsible_name, u.login_id AS responsible_login,
            l.name AS source_name, l.short_code AS source_short_code,
            w.short_code AS warehouse_code, w.name AS warehouse_name
     FROM deliveries d
     LEFT JOIN users u ON u.id = d.responsible_id
     JOIN locations l ON l.id = d.source_location_id
     JOIN warehouses w ON w.id = d.warehouse_id
     WHERE d.id = $1`,
    [id],
  );
  if (!delivery.rows[0]) throw new NotFoundError('Delivery');
  const lines = await fastify.db.query(
    `SELECT dl.*, p.name AS product_name, p.sku
     FROM delivery_lines dl JOIN products p ON p.id = dl.product_id
     WHERE dl.delivery_id = $1 ORDER BY dl.id`,
    [id],
  );
  return { ...shape(delivery.rows[0]), lines: lines.rows.map(shape) };
}

export async function deliveryRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/deliveries', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = [];
    const search = searchTerm(query);
    const status = statusTerm(query);
    if (search) {
      params.push(`%${search}%`);
      where.push(`(d.reference ILIKE $${params.length} OR d.contact ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`d.status = $${params.length}`);
    }
    const result = await fastify.db.query(
      `SELECT d.*, u.full_name AS responsible_name,
              w.short_code || '/' || l.short_code AS from_label
       FROM deliveries d
       LEFT JOIN users u ON u.id = d.responsible_id
       JOIN locations l ON l.id = d.source_location_id
       JOIN warehouses w ON w.id = d.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY d.created_at DESC`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/deliveries/:id', staff, async (request) => loadDelivery(fastify, (request.params as { id: string }).id));

  fastify.post('/api/deliveries', staff, async (request, reply) => {
    const body = parseBody(writeSchema, request.body);
    const id = await withTx(fastify.db, async (client) => {
      const reference = await generateReference(client, body.warehouseId, 'OUT');
      const inserted = await client.query(
        `INSERT INTO deliveries (
           reference, warehouse_id, source_location_id, delivery_address, contact, schedule_date, operation_type, responsible_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id`,
        [
          reference,
          body.warehouseId,
          body.sourceLocationId,
          body.deliveryAddress ?? null,
          body.contact ?? null,
          body.scheduleDate ?? null,
          body.operationType ?? null,
          request.user.id,
        ],
      );
      for (const line of body.lines) {
        await client.query(
          'INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES ($1,$2,$3)',
          [inserted.rows[0].id, line.productId, line.quantity],
        );
      }
      return inserted.rows[0].id as string;
    });
    return reply.status(201).send(await loadDelivery(fastify, id));
  });

  fastify.put('/api/deliveries/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(writeSchema.omit({ warehouseId: true }), request.body);
    await withTx(fastify.db, async (client) => {
      const existing = await client.query('SELECT status FROM deliveries WHERE id = $1 FOR UPDATE', [id]);
      if (!existing.rows[0]) throw new NotFoundError('Delivery');
      if (existing.rows[0].status !== 'draft') throw new AppError('Only draft documents can be edited', 400);
      await client.query(
        `UPDATE deliveries SET source_location_id = $2, delivery_address = $3, contact = $4,
         schedule_date = $5, operation_type = $6, updated_at = NOW() WHERE id = $1`,
        [id, body.sourceLocationId, body.deliveryAddress ?? null, body.contact ?? null, body.scheduleDate ?? null, body.operationType ?? null],
      );
      await client.query('DELETE FROM delivery_lines WHERE delivery_id = $1', [id]);
      for (const line of body.lines) {
        await client.query('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES ($1,$2,$3)', [
          id,
          line.productId,
          line.quantity,
        ]);
      }
    });
    return loadDelivery(fastify, id);
  });

  fastify.post('/api/deliveries/:id/confirm', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => confirmDelivery(client, id));
    return loadDelivery(fastify, id);
  });

  fastify.post('/api/deliveries/:id/validate', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => validateDelivery(client, id));
    return loadDelivery(fastify, id);
  });

  fastify.post('/api/deliveries/:id/cancel', staff, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.db.query('SELECT status FROM deliveries WHERE id = $1', [id]);
    if (!existing.rows[0]) throw new NotFoundError('Delivery');
    if (existing.rows[0].status === 'done') throw new AppError('Done documents cannot be canceled', 400);
    const result = await fastify.db.query(
      `UPDATE deliveries SET status = 'canceled', updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'waiting', 'ready') RETURNING id`,
      [id],
    );
    if (!result.rowCount) throw new AppError('Delivery cannot be canceled', 400);
    return loadDelivery(fastify, id);
  });
}
