import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../utils/errors.ts';
import { camelizeKeys } from '../utils/shape.ts';
import { parseBody, passwordSchema } from '../utils/validate.ts';
import { generateOTP, sendOtpEmail } from '../services/emailService.ts';

const signupSchema = z.object({
  loginId: z.string().min(6).max(12),
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(1).max(255).optional(),
});

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/signup', async (request, reply) => {
    const body = parseBody(signupSchema, request.body);
    const existing = await fastify.db.query(
      'SELECT login_id, email FROM users WHERE login_id = $1 OR email = $2',
      [body.loginId, body.email.toLowerCase()],
    );
    if (existing.rows[0]) {
      const sameLogin = existing.rows.some((row) => row.login_id === body.loginId);
      throw new AppError(sameLogin ? 'Login ID already exists' : 'Email already exists', 409);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await fastify.db.query(
      `INSERT INTO users (login_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'warehouse_staff')
       RETURNING id, login_id, email, full_name, role`,
      [body.loginId, body.email.toLowerCase(), passwordHash, body.fullName ?? body.loginId],
    );
    const user = result.rows[0];
    const token = fastify.jwt.sign({
      id: user.id,
      loginId: user.login_id,
      email: user.email,
      role: user.role,
    });
    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        loginId: user.login_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(camelizeKeys(request.body ?? {}));
    if (!parsed.success) {
      return reply.status(401).send({ error: 'Invalid Login Id or Password' });
    }
    const result = await fastify.db.query('SELECT * FROM users WHERE login_id = $1', [parsed.data.loginId]);
    const user = result.rows[0];
    const matches = user ? await bcrypt.compare(parsed.data.password, user.password_hash) : false;
    if (!user || !matches) {
      return reply.status(401).send({ error: 'Invalid Login Id or Password' });
    }
    const token = fastify.jwt.sign({
      id: user.id,
      loginId: user.login_id,
      email: user.email,
      role: user.role,
    });
    return reply.send({
      token,
      user: {
        id: user.id,
        loginId: user.login_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  });

  fastify.post('/api/auth/forgot-password', async (request, reply) => {
    const body = parseBody(z.object({ email: z.string().email() }), request.body);
    const email = body.email.toLowerCase();
    const user = await fastify.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!user.rows[0]) {
      return reply.send({ message: 'If the email exists, an OTP has been sent' });
    }
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await fastify.db.query('UPDATE otp_tokens SET used = true WHERE user_id = $1 AND used = false', [user.rows[0].id]);
    await fastify.db.query(
      'INSERT INTO otp_tokens (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [user.rows[0].id, otp, expiresAt],
    );
    const sent = await sendOtpEmail(email, otp);
    if (!sent.delivered && process.env.NODE_ENV === 'development') {
      return reply.send({
        message: 'If the email exists, an OTP has been sent',
        otp,
        error: sent.error,
      });
    }
    if (!sent.delivered) {
      return reply.status(502).send({ error: sent.error || 'Failed to send password reset email' });
    }
    return reply.send({ message: 'If the email exists, an OTP has been sent' });
  });

  fastify.post('/api/auth/reset-password', async (request, reply) => {
    const body = parseBody(
      z.object({
        email: z.string().email(),
        otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
        newPassword: passwordSchema,
      }),
      request.body,
    );
    const result = await fastify.db.query(
      `SELECT ot.id, ot.user_id
       FROM otp_tokens ot
       JOIN users u ON u.id = ot.user_id
       WHERE u.email = $1 AND ot.otp_code = $2 AND ot.used = false AND ot.expires_at > NOW()`,
      [body.email.toLowerCase(), body.otp],
    );
    if (!result.rows[0]) throw new AppError('Invalid or expired OTP', 400);
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await fastify.db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      result.rows[0].user_id,
    ]);
    await fastify.db.query('UPDATE otp_tokens SET used = true WHERE id = $1', [result.rows[0].id]);
    return reply.send({ message: 'Password reset successful' });
  });
}
