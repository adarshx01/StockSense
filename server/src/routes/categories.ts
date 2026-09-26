import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../utils/errors.ts';
import { parseBody } from '../utils/validate.ts';
import { shape } from '../utils/shape.ts';

const categorySchema = z.object({ name: z.string().min(1).max(255) });

export async function categoryRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };
  const manager = { onRequest: fastify.requireRoles('inventory_manager') };

  fastify.get('/api/categories', staff, async () => {
    const result = await fastify.db.query('SELECT * FROM categories ORDER BY name');
    return result.rows.map(shape);
  });

  fastify.get('/api/categories/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (!result.rows[0]) throw new NotFoundError('Category');
    return shape(result.rows[0]);
  });

  fastify.post('/api/categories', manager, async (request, reply) => {
    const body = parseBody(categorySchema, request.body);
    const result = await fastify.db.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [body.name]);
    return reply.status(201).send(shape(result.rows[0]));
  });

  fastify.put('/api/categories/:id', manager, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(categorySchema, request.body);
    const result = await fastify.db.query(
      'UPDATE categories SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id, body.name],
    );
    if (!result.rows[0]) throw new NotFoundError('Category');
    return shape(result.rows[0]);
  });

  fastify.delete('/api/categories/:id', manager, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundError('Category');
    return reply.status(204).send();
  });
}
