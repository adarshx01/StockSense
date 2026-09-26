import Fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { ZodError } from 'zod';
import { databasePlugin } from './plugins/database.ts';
import { authPlugin } from './plugins/auth.ts';
import { authRoutes } from './routes/auth.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { productRoutes } from './routes/products.ts';
import { categoryRoutes } from './routes/categories.ts';
import { stockRoutes } from './routes/stock.ts';
import { receiptRoutes } from './routes/receipts.ts';
import { deliveryRoutes } from './routes/deliveries.ts';
import { transferRoutes } from './routes/transfers.ts';
import { adjustmentRoutes } from './routes/adjustments.ts';
import { moveHistoryRoutes } from './routes/moveHistory.ts';
import { locationRoutes, warehouseRoutes } from './routes/warehouses.ts';
import { profileRoutes } from './routes/profile.ts';
import { AppError } from './utils/errors.ts';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const fastify = Fastify({
    logger: opts.logger ?? { level: process.env.LOG_LEVEL || 'info' },
    ...opts,
  });

  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await fastify.register(cors, {
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await fastify.register(formbody);
  await databasePlugin(fastify);
  await authPlugin(fastify);

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({ error: 'Invalid request' });
    }
    const pgCode = (error as { code?: string }).code;
    if (pgCode === '23505') return reply.status(409).send({ error: 'Already exists' });
    if (pgCode === '23514') return reply.status(422).send({ error: 'Stock cannot be negative' });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 401) return reply.status(401).send({ error: 'Unauthorized' });
    request.log.error({ err: error }, 'request failed');
    return reply.status(statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : 500).send({
      error: statusCode && statusCode >= 400 && statusCode < 500 ? 'Invalid request' : 'Internal server error',
    });
  });

  fastify.get('/api/health', async () => {
    await fastify.db.query('SELECT 1');
    return { status: 'ok' };
  });

  await fastify.register(authRoutes);
  await fastify.register(dashboardRoutes);
  await fastify.register(productRoutes);
  await fastify.register(categoryRoutes);
  await fastify.register(stockRoutes);
  await fastify.register(receiptRoutes);
  await fastify.register(deliveryRoutes);
  await fastify.register(transferRoutes);
  await fastify.register(adjustmentRoutes);
  await fastify.register(moveHistoryRoutes);
  await fastify.register(warehouseRoutes);
  await fastify.register(locationRoutes);
  await fastify.register(profileRoutes);

  return fastify;
}
