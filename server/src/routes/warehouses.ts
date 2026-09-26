import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { parseBody } from '../utils/validate.ts';
import { shape } from '../utils/shape.ts';

const warehouseSchema = z.object({
  name: z.string().min(1).max(255),
  shortCode: z.string().min(1).max(10),
  address: z.string().max(500).nullable().optional(),
});

const locationSchema = z.object({
  warehouseId: z.string().uuid(),
  name: z.string().min(1).max(255),
  shortCode: z.string().min(1).max(50),
  isDefault: z.boolean().optional(),
});

export async function warehouseRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };
  const manager = { onRequest: fastify.requireRoles('inventory_manager') };

  fastify.get('/api/warehouses', staff, async () => {
    const result = await fastify.db.query(
      `SELECT w.*, (SELECT COUNT(*) FROM locations l WHERE l.warehouse_id = w.id) AS location_count
       FROM warehouses w ORDER BY w.name`,
    );
    return result.rows.map((row) => ({ ...shape(row), locationCount: Number(row.location_count) }));
  });

  fastify.get('/api/warehouses/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db.query('SELECT * FROM warehouses WHERE id = $1', [id]);
    if (!result.rows[0]) throw new NotFoundError('Warehouse');
    const locations = await fastify.db.query(
      'SELECT * FROM locations WHERE warehouse_id = $1 ORDER BY short_code',
      [id],
    );
    return { ...shape(result.rows[0]), locations: locations.rows.map(shape) };
  });

  fastify.post('/api/warehouses', manager, async (request, reply) => {
    const body = parseBody(warehouseSchema, request.body);
    const result = await fastify.db.query(
      'INSERT INTO warehouses (name, short_code, address) VALUES ($1, $2, $3) RETURNING *',
      [body.name, body.shortCode, body.address ?? null],
    );
    return reply.status(201).send(shape(result.rows[0]));
  });

  fastify.put('/api/warehouses/:id', manager, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(warehouseSchema, request.body);
    const result = await fastify.db.query(
      'UPDATE warehouses SET name = $2, short_code = $3, address = $4, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id, body.name, body.shortCode, body.address ?? null],
    );
    if (!result.rows[0]) throw new NotFoundError('Warehouse');
    return shape(result.rows[0]);
  });

  fastify.delete('/api/warehouses/:id', manager, async (request, reply) => {
    const { id } = request.params as { id: string };
    const used = await fastify.db.query('SELECT 1 FROM receipts WHERE warehouse_id = $1 LIMIT 1', [id]);
    if (used.rowCount) throw new AppError('Warehouse has operations and cannot be deleted', 409);
    const result = await fastify.db.query('DELETE FROM warehouses WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundError('Warehouse');
    return reply.status(204).send();
  });
}

export async function locationRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };
  const manager = { onRequest: fastify.requireRoles('inventory_manager') };

  fastify.get('/api/locations', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const warehouseId = query.warehouseId ?? query.warehouse_id;
    const params: unknown[] = [];
    let where = '';
    if (warehouseId) {
      params.push(warehouseId);
      where = 'WHERE l.warehouse_id = $1';
    }
    const result = await fastify.db.query(
      `SELECT l.*, w.short_code AS warehouse_code, w.name AS warehouse_name
       FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
       ${where}
       ORDER BY w.short_code, l.short_code`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/locations/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db.query(
      `SELECT l.*, w.short_code AS warehouse_code FROM locations l
       JOIN warehouses w ON w.id = l.warehouse_id WHERE l.id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundError('Location');
    return shape(result.rows[0]);
  });

  fastify.post('/api/locations', manager, async (request, reply) => {
    const body = parseBody(locationSchema, request.body);
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      const existingDefault = await client.query(
        'SELECT id FROM locations WHERE warehouse_id = $1 AND is_default = true',
        [body.warehouseId],
      );
      const makeDefault = body.isDefault === true || existingDefault.rowCount === 0;
      if (makeDefault) {
        await client.query('UPDATE locations SET is_default = false WHERE warehouse_id = $1', [body.warehouseId]);
      }
      const result = await client.query(
        `INSERT INTO locations (warehouse_id, name, short_code, is_default)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [body.warehouseId, body.name, body.shortCode, makeDefault],
      );
      await client.query('COMMIT');
      return reply.status(201).send(shape(result.rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.put('/api/locations/:id', manager, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(locationSchema.partial().required({ name: true, shortCode: true }), request.body);
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM locations WHERE id = $1 FOR UPDATE', [id]);
      if (!current.rows[0]) throw new NotFoundError('Location');
      if (body.isDefault) {
        await client.query('UPDATE locations SET is_default = false WHERE warehouse_id = $1', [current.rows[0].warehouse_id]);
      }
      const result = await client.query(
        `UPDATE locations SET name = $2, short_code = $3, is_default = COALESCE($4, is_default), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, body.name, body.shortCode, body.isDefault ?? null],
      );
      await client.query('COMMIT');
      return shape(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.delete('/api/locations/:id', manager, async (request, reply) => {
    const { id } = request.params as { id: string };
    const used = await fastify.db.query('SELECT 1 FROM stock_levels WHERE location_id = $1 AND on_hand > 0 LIMIT 1', [id]);
    if (used.rowCount) throw new AppError('Location still holds stock', 409);
    const result = await fastify.db.query('DELETE FROM locations WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundError('Location');
    return reply.status(204).send();
  });
}
