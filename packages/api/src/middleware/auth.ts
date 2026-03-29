import type { Context, Next } from 'hono';
import { verifyToken } from '../lib/jwt.js';

declare module 'hono' {
  interface ContextVariableMap {
    operatorId: string;
    callsign: string;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const token = header.slice(7);
    const payload = await verifyToken(token);
    c.set('operatorId', payload.sub);
    c.set('callsign', payload.callsign);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
