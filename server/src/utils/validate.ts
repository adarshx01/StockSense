import { z, ZodType } from 'zod';
import { AppError } from './errors.ts';
import { camelizeKeys } from './shape.ts';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(camelizeKeys(body ?? {}));
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new AppError(message || 'Invalid request', 422);
  }
  return result.data;
}

export const passwordSchema = z.string().superRefine((password, ctx) => {
  if (password.length <= 8) {
    ctx.addIssue({ code: 'custom', message: 'Password must be more than 8 characters' });
  }
  if (!/[a-z]/.test(password)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain a lowercase letter' });
  }
  if (!/[A-Z]/.test(password)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain an uppercase letter' });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain a special character' });
  }
});

export const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').nullable().optional();
