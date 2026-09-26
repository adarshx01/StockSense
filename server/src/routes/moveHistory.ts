import { FastifyInstance } from 'fastify';
import { searchTerm, shape } from '../utils/shape.ts';

export async function moveHistoryRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/move-history',
    { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') },
    async (request) => {
      const query = request.query as Record<string, string | undefined>;
      const params: unknown[] = [];
      const where: string[] = [];
      const search = searchTerm(query);
      if (search) {
        params.push(`%${search}%`);
        where.push(`(sm.reference ILIKE $${params.length} OR sm.contact ILIKE $${params.length})`);
      }
      if (query.direction) {
        params.push(query.direction);
        where.push(`sm.direction = $${params.length}`);
      }
      if (query.productId) {
        params.push(query.productId);
        where.push(`sm.product_id = $${params.length}`);
      }
      const result = await fastify.db.query(
        `SELECT sm.*, p.name AS product_name, p.sku
         FROM stock_moves sm
         JOIN products p ON p.id = sm.product_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY sm.created_at DESC, sm.id`,
        params,
      );
      return result.rows.map((row) => ({
        ...shape(row),
        from: row.from_label,
        to: row.to_label,
      }));
    },
  );
}
