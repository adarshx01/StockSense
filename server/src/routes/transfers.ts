import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { dateSchema, lineSchema, parseBody } from '../utils/validate.ts';
import { shape } from '../utils/shape.ts';
import { generateReference } from '../services/referenceService.ts';
import { confirmTransfer, validateTransfer, withTx } from '../services/inventoryService.ts';

const writeSchema = z.object({
  warehouseId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  contact: z.string().max(255).nullable().optional(),
  scheduleDate: dateSchema,
  lines: z.array(lineSchema).min(1),
});

async function loadTransfer(fastify: FastifyInstance, id: string) {
  const transfer = await fastify.db.query(
    `SELECT t.*, u.full_name AS responsible_name, u.login_id AS responsible_login,
            fl.name AS from_name, fl.short_code AS from_short_code,
            tl.name AS to_name, tl.short_code AS to_short_code,
            w.short_code AS warehouse_code, w.name AS warehouse_name
     FROM internal_transfers t
     LEFT JOIN users u ON u.id = t.responsible_id
     JOIN locations fl ON fl.id = t.from_location_id
     JOIN locations tl ON tl.id = t.to_location_id
     JOIN warehouses w ON w.id = t.warehouse_id
     WHERE t.id = $1`,
    [id],
  );
  if (!transfer.rows[0]) throw new NotFoundError('Transfer');
  const lines = await fastify.db.query(
    `SELECT tl.*, p.name AS product_name, p.sku
     FROM transfer_lines tl JOIN products p ON p.id = tl.product_id
     WHERE tl.transfer_id = $1 ORDER BY tl.id`,
    [id],
  );
  return { ...shape(transfer.rows[0]), lines: lines.rows.map(shape) };
}

export async function transferRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/transfers', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = [];
    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(t.reference ILIKE $${params.length} OR t.contact ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`t.status = $${params.length}`);
    }
    const result = await fastify.db.query(
      `SELECT t.*, u.full_name AS responsible_name,
              w.short_code || '/' || fl.short_code AS from_label,
              w.short_code || '/' || tl.short_code AS to_label
       FROM internal_transfers t
       LEFT JOIN users u ON u.id = t.responsible_id
       JOIN locations fl ON fl.id = t.from_location_id
       JOIN locations tl ON tl.id = t.to_location_id
       JOIN warehouses w ON w.id = t.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.created_at DESC`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/transfers/:id', staff, async (request) => loadTransfer(fastify, (request.params as { id: string }).id));

  fastify.post('/api/transfers', staff, async (request, reply) => {
    const body = parseBody(writeSchema, request.body);
    if (body.fromLocationId === body.toLocationId) throw new AppError('Source and destination must differ', 422);
    const id = await withTx(fastify.db, async (client) => {
      const reference = await generateReference(client, body.warehouseId, 'INT');
      const inserted = await client.query(
        `INSERT INTO internal_transfers (
           reference, warehouse_id, from_location_id, to_location_id, contact, schedule_date, responsible_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING id`,
        [reference, body.warehouseId, body.fromLocationId, body.toLocationId, body.contact ?? null, body.scheduleDate ?? null, request.user.id],
      );
      for (const line of body.lines) {
        await client.query('INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES ($1,$2,$3)', [
          inserted.rows[0].id,
          line.productId,
          line.quantity,
        ]);
      }
      return inserted.rows[0].id as string;
    });
    return reply.status(201).send(await loadTransfer(fastify, id));
  });

  fastify.put('/api/transfers/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(writeSchema.omit({ warehouseId: true }), request.body);
    if (body.fromLocationId === body.toLocationId) throw new AppError('Source and destination must differ', 422);
    await withTx(fastify.db, async (client) => {
      const existing = await client.query('SELECT status FROM internal_transfers WHERE id = $1 FOR UPDATE', [id]);
      if (!existing.rows[0]) throw new NotFoundError('Transfer');
      if (existing.rows[0].status !== 'draft') throw new AppError('Only draft documents can be edited', 400);
      await client.query(
        `UPDATE internal_transfers SET from_location_id = $2, to_location_id = $3, contact = $4, schedule_date = $5, updated_at = NOW()
         WHERE id = $1`,
        [id, body.fromLocationId, body.toLocationId, body.contact ?? null, body.scheduleDate ?? null],
      );
      await client.query('DELETE FROM transfer_lines WHERE transfer_id = $1', [id]);
      for (const line of body.lines) {
        await client.query('INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES ($1,$2,$3)', [
          id,
          line.productId,
          line.quantity,
        ]);
      }
    });
    return loadTransfer(fastify, id);
  });

  fastify.post('/api/transfers/:id/confirm', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => confirmTransfer(client, id));
    return loadTransfer(fastify, id);
  });

  fastify.post('/api/transfers/:id/validate', staff, async (request) => {
    const { id } = request.params as { id: string };
    await withTx(fastify.db, (client) => validateTransfer(client, id));
    return loadTransfer(fastify, id);
  });

  fastify.post('/api/transfers/:id/cancel', staff, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.db.query('SELECT status FROM internal_transfers WHERE id = $1', [id]);
    if (!existing.rows[0]) throw new NotFoundError('Transfer');
    if (existing.rows[0].status === 'done') throw new AppError('Done documents cannot be canceled', 400);
    const result = await fastify.db.query(
      `UPDATE internal_transfers SET status = 'canceled', updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'waiting', 'ready') RETURNING id`,
      [id],
    );
    if (!result.rowCount) throw new AppError('Transfer cannot be canceled', 400);
    return loadTransfer(fastify, id);
  });
}
