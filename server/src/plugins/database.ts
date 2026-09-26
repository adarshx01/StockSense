import { FastifyInstance } from 'fastify';
import pg from 'pg';
import { createPool } from '../db/pool.ts';

export async function databasePlugin(fastify: FastifyInstance) {
  const pool = createPool();
  const client = await pool.connect();
  client.release();
  fastify.decorate('db', pool);
  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
  }
}
