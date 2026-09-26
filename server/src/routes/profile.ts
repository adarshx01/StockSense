import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { parseBody } from '../utils/validate.ts';

export async function profileRoutes(fastify: FastifyInstance) {
  const staff = { onRequest: fastify.requireRoles('inventory_manager', 'warehouse_staff') };

  fastify.get('/api/profile', staff, async (request) => {
    const result = await fastify.db.query(
      'SELECT id, login_id, email, full_name, role, created_at FROM users WHERE id = $1',
      [request.user.id],
    );
    if (!result.rows[0]) throw new NotFoundError('User');
    const user = result.rows[0];
    return {
      id: user.id,
      loginId: user.login_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      createdAt: user.created_at,
    };
  });

  fastify.put('/api/profile', staff, async (request) => {
    const body = parseBody(
      z.object({
        fullName: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
      }),
      request.body,
    );
    if (body.email) {
      const clash = await fastify.db.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [
        body.email.toLowerCase(),
        request.user.id,
      ]);
      if (clash.rowCount) throw new AppError('Email already exists', 409);
    }
    const result = await fastify.db.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, login_id, email, full_name, role`,
      [request.user.id, body.fullName ?? null, body.email?.toLowerCase() ?? null],
    );
    const user = result.rows[0];
    return {
      id: user.id,
      loginId: user.login_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };
  });
}
