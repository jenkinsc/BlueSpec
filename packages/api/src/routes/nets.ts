import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { nets } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';

const MODE_ENUM = ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'] as const;
const STATUS_ENUM = ['draft', 'open', 'closed'] as const;

// Frequency validated as a decimal string e.g. "146.520"
const FrequencySchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Frequency must be a decimal number string');

const CreateNetSchema = z.object({
  name: z.string().min(1),
  frequency: FrequencySchema,
  mode: z.enum(MODE_ENUM).default('FM'),
  schedule: z.string().optional(),
});

const UpdateNetSchema = z.object({
  name: z.string().min(1).optional(),
  frequency: FrequencySchema.optional(),
  mode: z.enum(MODE_ENUM).optional(),
  schedule: z.string().optional(),
});

const ListStatusSchema = z.enum([...STATUS_ENUM, 'all']).default('open');

export const netsRouter = new Hono()
  // GET /nets — list nets, optional ?status= filter (default: open)
  .get('/', async (c) => {
    const statusParam = c.req.query('status') ?? 'open';
    const parsed = ListStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return c.json({ error: 'Invalid status. Use: draft, open, closed, all' }, 400);
    }
    const filter = parsed.data;
    const rows =
      filter === 'all'
        ? await db.select().from(nets)
        : await db.select().from(nets).where(eq(nets.status, filter));
    return c.json(rows);
  })

  // GET /nets/:id — get net by id
  .get('/:id', async (c) => {
    const id = c.req.param('id') as string;
    const [row] = await db
      .select()
      .from(nets)
      .where(eq(nets.id, id))
      .limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })

  // POST /nets — create a net in draft status (auth required)
  .post('/', requireAuth, zValidator('json', CreateNetSchema), async (c) => {
    const body = c.req.valid('json');
    const callsign = c.get('callsign') as string;
    const now = new Date().toISOString();
    const [created] = await db
      .insert(nets)
      .values({
        id: newId(),
        name: body.name,
        frequency: parseFloat(body.frequency),
        mode: body.mode,
        schedule: body.schedule,
        netControl: callsign,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json(created, 201);
  })

  // PATCH /nets/:id — update name/frequency/mode/schedule (auth required, net_control only)
  .patch('/:id', requireAuth, zValidator('json', UpdateNetSchema), async (c) => {
    const id = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;
    const body = c.req.valid('json');

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (row.netControlId && row.netControlId !== operatorId) {
      return c.json({ error: 'Forbidden: only the net control operator may update this net' }, 403);
    }

    const now = new Date().toISOString();
    const updates: Partial<typeof row> = { updatedAt: now };
    if (body.name !== undefined) updates.name = body.name;
    if (body.frequency !== undefined) updates.frequency = parseFloat(body.frequency);
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.schedule !== undefined) updates.schedule = body.schedule;

    const [updated] = await db
      .update(nets)
      .set(updates)
      .where(eq(nets.id, id))
      .returning();
    return c.json(updated);
  })

  // POST /nets/:id/open — transition draft → open; sets net_control_id and opened_at
  .post('/:id/open', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (row.status !== 'draft') {
      return c.json(
        { error: `Conflict: net is already ${row.status}; can only open a draft net` },
        409,
      );
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(nets)
      .set({ status: 'open', netControlId: operatorId, openedAt: now, updatedAt: now })
      .where(eq(nets.id, id))
      .returning();
    return c.json(updated);
  })

  // POST /nets/:id/close — transition open → closed (auth required, net_control only)
  .post('/:id/close', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (row.status !== 'open') {
      return c.json(
        { error: `Conflict: net is ${row.status}; can only close an open net` },
        409,
      );
    }

    if (row.netControlId !== operatorId) {
      return c.json({ error: 'Forbidden: only the net control operator may close this net' }, 403);
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(nets)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(nets.id, id))
      .returning();
    return c.json(updated);
  });
