import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { netTemplates } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { tryGetOrgId } from '../middleware/org.js';

const MODE_ENUM = ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'] as const;

const FrequencySchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Frequency must be a decimal number string');

const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  frequency: FrequencySchema,
  mode: z.enum(MODE_ENUM).default('FM'),
  region: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  frequency: FrequencySchema.optional(),
  mode: z.enum(MODE_ENUM).optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

export const templatesRouter = new Hono()
  // GET /templates — list templates (auth required)
  // If X-Org-Id is present: validates membership and filters by org.
  // Without X-Org-Id: filters by operatorId (existing per-operator behavior).
  .get('/', requireAuth, async (c) => {
    const operatorId = c.get('operatorId');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const rows = orgId
      ? await db.select().from(netTemplates).where(eq(netTemplates.organizationId, orgId))
      : await db.select().from(netTemplates).where(eq(netTemplates.operatorId, operatorId));
    return c.json(rows);
  })

  // GET /templates/:id — get by id
  // If X-Org-Id is present and template belongs to a different org, returns 404.
  .get('/:id', async (c) => {
    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db
      .select()
      .from(netTemplates)
      .where(eq(netTemplates.id, c.req.param('id') as string))
      .limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json(row);
  })

  // POST /templates — create (auth required)
  // If X-Org-Id is present, validates membership and sets organizationId.
  .post('/', requireAuth, zValidator('json', CreateTemplateSchema), async (c) => {
    const operatorId = c.get('operatorId');
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const now = new Date().toISOString();
    const [created] = await db
      .insert(netTemplates)
      .values({
        id: newId(),
        operatorId,
        organizationId: orgId,
        name: body.name,
        frequency: body.frequency,
        mode: body.mode,
        region: body.region,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json(created, 201);
  })

  // PATCH /templates/:id — update (owner only)
  .patch('/:id', requireAuth, zValidator('json', UpdateTemplateSchema), async (c) => {
    const operatorId = c.get('operatorId');
    const id = c.req.param('id') as string;
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(netTemplates).where(eq(netTemplates.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    if (row.operatorId !== operatorId) return c.json({ error: 'Forbidden' }, 403);

    const now = new Date().toISOString();
    const updates: Partial<typeof row> = { updatedAt: now };
    if (body.name !== undefined) updates.name = body.name;
    if (body.frequency !== undefined) updates.frequency = body.frequency;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.region !== undefined) updates.region = body.region;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await db
      .update(netTemplates)
      .set(updates)
      .where(and(eq(netTemplates.id, id), eq(netTemplates.operatorId, operatorId)))
      .returning();
    return c.json(updated);
  })

  // DELETE /templates/:id — delete (owner only)
  .delete('/:id', requireAuth, async (c) => {
    const operatorId = c.get('operatorId');
    const id = c.req.param('id') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(netTemplates).where(eq(netTemplates.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    if (row.operatorId !== operatorId) return c.json({ error: 'Forbidden' }, 403);

    await db
      .delete(netTemplates)
      .where(and(eq(netTemplates.id, id), eq(netTemplates.operatorId, operatorId)));
    return c.body(null, 204);
  });
