import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = randomUUID();
  const start = Date.now();

  c.set('requestId', requestId);

  await next();

  const duration = Date.now() - start;
  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });
};
