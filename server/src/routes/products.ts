import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { parseBody } from '../utils/validate.ts';
import { shape } from '../utils/shape.ts';
import { createAndApplyAdjustment, withTx } from '../services/inventoryService.ts';

const productSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(50),
  categoryId: z.string().uuid().nullable().optional(),
  uom: z.string().min(1).max(50).optional(),
  perUnitCost: z.number().min(0),
  reorderLevel: z.number().int().min(0),
  initialStock: z.number().min(0).optional(),
  warehouseId: z.string().uuid().optional(),
});

const productUpdateSchema = productSchema.partial().extend({
  reorderLevel: z.number().int().min(0).optional(),
});

async function defaultLocation(fastify: FastifyInstance, warehouseId?: string) {
  if (!warehouseId) {
    const warehouses = await fastify.db.query('SELECT id FROM warehouses ORDER BY created_at');
    if (warehouses.rowCount !== 1) throw new AppError('warehouseId is required to post initial stock', 422);
    warehouseId = warehouses.rows[0].id;
  }
  const location = await fastify.db.query(
    'SELECT id FROM locations WHERE warehouse_id = $1 AND is_default = true',
    [warehouseId],
  );
  if (!location.rows[0]) throw new AppError('Warehouse has no default internal location', 422);
  return location.rows[0].id as string;
}

export async function productRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };
  const manager = { onRequest: fastify.requireRoles('inventory_manager') };

  fastify.get('/api/products', staff, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const search = query.search;
    const categoryId = query.categoryId ?? query.category_id;
    const params: unknown[] = [];
    const where: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }
    if (categoryId) {
      params.push(categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    const result = await fastify.db.query(
      `SELECT p.*, c.name AS category_name,
              COALESCE(ts.total_stock, 0) AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT product_id, SUM(on_hand) AS total_stock FROM stock_levels GROUP BY product_id
       ) ts ON ts.product_id = p.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.name`,
      params,
    );
    return result.rows.map(shape);
  });

  fastify.get('/api/products/:id', staff, async (request) => {
    const { id } = request.params as { id: string };
    const product = await fastify.db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
      [id],
    );
    if (!product.rows[0]) throw new NotFoundError('Product');
    const stock = await fastify.db.query(
      `SELECT sl.*, l.name AS location_name, l.short_code, w.short_code AS warehouse_code
       FROM stock_levels sl
       JOIN locations l ON l.id = sl.location_id
       JOIN warehouses w ON w.id = l.warehouse_id
       WHERE sl.product_id = $1
       ORDER BY l.short_code`,
      [id],
    );
    return { ...shape(product.rows[0]), stockByLocation: stock.rows.map(shape) };
  });

  fastify.post('/api/products', manager, async (request, reply) => {
    const body = parseBody(productSchema, request.body);
    const created = await withTx(fastify.db, async (client) => {
      const result = await client.query(
        `INSERT INTO products (name, sku, category_id, uom, per_unit_cost, reorder_level)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [body.name, body.sku, body.categoryId ?? null, body.uom ?? 'Units', body.perUnitCost, body.reorderLevel],
      );
      const product = result.rows[0];
      if (body.initialStock && body.initialStock > 0) {
        const locationId = await defaultLocation(fastify, body.warehouseId);
        await createAndApplyAdjustment(client, {
          productId: product.id,
          locationId,
          countedQty: body.initialStock,
          reason: 'Initial stock',
          userId: request.user.id,
        });
      }
      return product;
    });
    return reply.status(201).send(shape(created));
  });

  fastify.put('/api/products/:id', manager, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(productUpdateSchema, request.body);
    const result = await fastify.db.query(
      `UPDATE products SET
         name = COALESCE($2, name),
         sku = COALESCE($3, sku),
         category_id = COALESCE($4, category_id),
         uom = COALESCE($5, uom),
         per_unit_cost = COALESCE($6, per_unit_cost),
         reorder_level = COALESCE($7, reorder_level),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, body.name ?? null, body.sku ?? null, body.categoryId ?? null, body.uom ?? null, body.perUnitCost ?? null, body.reorderLevel ?? null],
    );
    if (!result.rows[0]) throw new NotFoundError('Product');
    return shape(result.rows[0]);
  });

  fastify.put('/api/products/:id/reorder', manager, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(z.object({ reorderLevel: z.number().int().min(0) }), request.body);
    const result = await fastify.db.query(
      'UPDATE products SET reorder_level = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id, body.reorderLevel],
    );
    if (!result.rows[0]) throw new NotFoundError('Product');
    return shape(result.rows[0]);
  });

  fastify.delete('/api/products/:id', manager, async (request, reply) => {
    const { id } = request.params as { id: string };
    const used = await fastify.db.query('SELECT 1 FROM stock_moves WHERE product_id = $1 LIMIT 1', [id]);
    if (used.rowCount) throw new AppError('Product has stock history and cannot be deleted', 409);
    const result = await fastify.db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundError('Product');
    return reply.status(204).send();
  });
}
