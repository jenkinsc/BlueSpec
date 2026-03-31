import type { MiddlewareHandler } from 'hono';

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitWindow>>();

function getStore(name: string): Map<string, RateLimitWindow> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

export function rateLimit(opts: {
  name: string;
  max: number;
  windowMs: number;
}): MiddlewareHandler {
  // Skip rate limiting in test environment to prevent concurrent test suites from conflicting
  if (process.env.NODE_ENV === 'test') {
    return (_c, next) => next();
  }

  const store = getStore(opts.name);

  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }

    return next();
  };
}
