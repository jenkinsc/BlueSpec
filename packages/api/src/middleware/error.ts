import type { Context } from 'hono';
import { ZodError } from 'zod';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ZodError) {
    return c.json({ error: 'Validation error', issues: err.issues }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
}
