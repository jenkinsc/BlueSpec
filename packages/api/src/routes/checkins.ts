import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { checkIns } from '../db/schema.js';

// Generic check-ins router — read-only, kept for M1 compatibility / search use
// Mutations (POST/PATCH/DELETE) are net-scoped: /nets/:netId/check-ins (see nets.ts)
export const checkInsRouter = new Hono()
  // GET /check-ins?netId=<id> — list all check-ins, optional net filter
  .get('/', async (c) => {
    const netId = c.req.query('netId');
    const rows = netId
      ? await db.select().from(checkIns).where(eq(checkIns.netId, netId))
      : await db.select().from(checkIns);
    return c.json(rows);
  })

  // GET /check-ins/:id — get a single check-in by id
  .get('/:id', async (c) => {
    const [row] = await db
      .select()
      .from(checkIns)
      .where(eq(checkIns.id, c.req.param('id')))
      .limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  });
