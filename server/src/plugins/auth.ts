import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { AppError } from '../utils/errors.ts';

export async function authPlugin(fastify: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');

  await fastify.register(fastifyJwt, {
    secret,
    sign: { expiresIn: '24h' },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    await request.jwtVerify();
  });

  fastify.decorate('requireRoles', (...roles: string[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      await request.jwtVerify();
      if (!roles.includes(request.user.role)) {
        throw new AppError('Forbidden', 403);
      }
    };
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (...roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; loginId: string; email: string; role: string };
    user: { id: string; loginId: string; email: string; role: string };
  }
}
