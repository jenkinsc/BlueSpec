import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { operators } from '../db/schema.js';
import { newId } from '../lib/ids.js';

const CreateOperatorSchema = z.object({
  callsign: z.string().min(3).max(10).toUpperCase(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  licenseClass: z.enum(['technician', 'general', 'extra']).optional(),
});

const UpdateOperatorSchema = CreateOperatorSchema.partial();

export const operatorsRouter = new Hono()
  // List all operators
  .get('/', async (c) => {
    const rows = await db.select().from(operators);
    return c.json(rows.map(({ passwordHash: _, ...op }) => op));
  })

  // Get one operator by callsign or id
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [row] = await db.select().from(operators).where(eq(operators.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);
    const { passwordHash: _, ...op } = row;
    return c.json(op);
  })

  // Create operator
  .post('/', zValidator('json', CreateOperatorSchema), async (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const [created] = await db
      .insert(operators)
      .values({ ...body, id: newId(), createdAt: now, updatedAt: now })
      .returning();
    const { passwordHash: _, ...op } = created;
    return c.json(op, 201);
  })

  // Update operator
  .patch('/:id', zValidator('json', UpdateOperatorSchema), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const [updated] = await db
      .update(operators)
      .set({ ...body, updatedAt: now })
      .where(eq(operators.id, id))
      .returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);
    const { passwordHash: _, ...op } = updated;
    return c.json(op);
  })

  // Delete operator
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const [deleted] = await db.delete(operators).where(eq(operators.id, id)).returning();
    if (!deleted) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
