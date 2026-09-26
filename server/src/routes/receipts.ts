import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { dateSchema, lineSchema, parseBody } from '../utils/validate.ts';
import { searchTerm, shape, statusTerm } from '../utils/shape.ts';
import { generateReference } from '../services/referenceService.ts';
import { confirmReceipt, validateReceipt, withTx } from '../services/inventoryService.ts';

const writeSchema = z.object({
  warehouseId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  contact: z.string().max(255).nullable().optional(),
  scheduleDate: dateSchema,
  lines: z.array(lineSchema).min(1),
});

async function loadReceipt(fastify: FastifyInstance, id: string) {
  const receipt = await fastify.db.query(
    `SELECT r.*, u.full_name AS responsible_name, u.login_id AS responsible_login,
            l.name AS destination_name, l.short_code AS destination_short_code,
            w.short_code AS warehouse_code, w.name AS warehouse_name
     FROM receipts r
     LEFT JOIN users u ON u.id = r.responsible_id
     JOIN locations l ON l.id = r.destination_location_id
     JOIN warehouses w ON w.id = r.warehouse_id
     WHERE r.id = $1`,
    [id],
  );
  if (!receipt.rows[0]) throw new NotFoundError('Receipt');
  const lines = await fastify.db.query(
    `SELECT rl.*, p.name AS product_name, p.sku
     FROM receipt_lines rl JOIN products p ON p.id = rl.product_id
     WHERE rl.receipt_id = $1 ORDER BY rl.id`,
    [id],
  );
  return { ...shape(receipt.rows[0]), lines: lines.rows.map(shape) };
}

export async function receiptRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/receipts', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = [];
    const search = searchTerm(query);
    const status = statusTerm(query);
    if (search) {
      params.push(`%${search}%`);
      where.push(`(r.reference ILIKE $${params.length} OR r.contact ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    }
    const result = await fastify.db.query(
      `SELECT r.*, u.full_name AS responsible_name,
              w.short_code || '/' || l.short_code AS to_label
       FROM receipts r
       LEFT JOIN users u ON u.id = r.responsible_id
       JOIN locations l ON l.id = r.destination_location_id
       JOIN warehouses w ON w.id = r.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/receipts/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    return loadReceipt(fastify, id);
  });

  fastify.post('/api/receipts', staff, async (request, reply) => {
    const body = parseBody(writeSchema, request.body);
    const id = await withTx(fastify.db, async (client) => {
      const reference = await generateReference(client, body.warehouseId, 'IN');
      const inserted = await client.query(
        `INSERT INTO receipts (reference, warehouse_id, destination_location_id, contact, schedule_date, responsible_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING id`,
        [reference, body.warehouseId, body.destinationLocationId, body.contact ?? null, body.scheduleDate ?? null, request.user.id],
      );
      for (const line of body.lines) {
        await client.query('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES ($1,$2,$3)', [
          inserted.rows[0].id,
          line.productId,
          line.quantity,
        ]);
      }
      return inserted.rows[0].id as string;
    });
    return reply.status(201).send(await loadReceipt(fastify, id));
  });

  fastify.put('/api/receipts/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(writeSchema.partial().required({ lines: true }).omit({ warehouseId: true }), request.body);
    await withTx(fastify.db, async (client) => {
      const existing = await client.query('SELECT status FROM receipts WHERE id = $1 FOR UPDATE', [id]);
      if (!existing.rows[0]) throw new NotFoundError('Receipt');
      if (existing.rows[0].status !== 'draft') throw new AppError('Only draft documents can be edited', 400);
      await client.query(
        `UPDATE receipts SET
           destination_location_id = COALESCE($2, destination_location_id),
           contact = COALESCE($3, contact),
           schedule_date = COALESCE($4, schedule_date),
           updated_at = NOW()
         WHERE id = $1`,
        [id, body.destinationLocationId ?? null, body.contact ?? null, body.scheduleDate ?? null],
      );
      await client.query('DELETE FROM receipt_lines WHERE receipt_id = $1', [id]);
      for (const line of body.lines) {
        await client.query('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES ($1,$2,$3)', [
          id,
          line.productId,
          line.quantity,
        ]);
      }
    });
    return loadReceipt(fastify, id);
  });

  fastify.post('/api/receipts/:id/confirm', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => confirmReceipt(client, id));
    return loadReceipt(fastify, id);
  });

  fastify.post('/api/receipts/:id/validate', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => validateReceipt(client, id));
    return loadReceipt(fastify, id);
  });

  fastify.post('/api/receipts/:id/cancel', staff, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.db.query('SELECT status FROM receipts WHERE id = $1', [id]);
    if (!existing.rows[0]) throw new NotFoundError('Receipt');
    if (existing.rows[0].status === 'done') throw new AppError('Done documents cannot be canceled', 400);
    const result = await fastify.db.query(
      `UPDATE receipts SET status = 'canceled', updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'waiting', 'ready') RETURNING id`,
      [id],
    );
    if (!result.rowCount) throw new AppError('Receipt cannot be canceled', 400);
    return loadReceipt(fastify, id);
  });
}
