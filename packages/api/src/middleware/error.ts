import type { Context } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ZodError) {
    return c.json({ error: 'Validation error', issues: err.issues }, 422);
  }
  logger.error({ err, requestId: c.get('requestId') }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
}
