import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { incidents, incidentActivities, nets } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { tryGetOrgId } from '../middleware/org.js';

const STATUS_ENUM = ['reported', 'active', 'resolved', 'cancelled'] as const;
// Forward-only transition order for reported → active → resolved
const STATUS_ORDER: Record<string, number> = { reported: 0, active: 1, resolved: 2 };

const CreateIncidentSchema = z.object({
  title: z.string().min(1),
  incident_type: z.string().min(1),
  activation_level: z.coerce.number().int().min(1).max(3),
  served_agency: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  net_id: z.string().optional(),
});

const UpdateIncidentSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(STATUS_ENUM).optional(),
  incident_type: z.string().min(1).optional(),
  activation_level: z.coerce.number().int().min(1).max(3).optional(),
  served_agency: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  net_id: z.string().nullable().optional(),
});

const CreateActivitySchema = z.object({
  note: z.string().min(1),
});

export const incidentsRouter = new Hono()
  // GET /incidents — list; optional ?status= and ?netId= filters
  // If X-Org-Id header is present, validates membership and filters by org.
  // Without X-Org-Id, returns all incidents (public access preserved).
  .get('/', async (c) => {
    const statusParam = c.req.query('status');
    const netIdParam = c.req.query('netId');

    if (statusParam) {
      const parsed = z.enum(STATUS_ENUM).safeParse(statusParam);
      if (!parsed.success) {
        return c.json({ error: `Invalid status. Use: ${STATUS_ENUM.join(', ')}` }, 400);
      }
    }

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    let query = db.select().from(incidents).$dynamic();
    const conditions = [];
    if (orgId) conditions.push(eq(incidents.organizationId, orgId));
    if (statusParam) conditions.push(eq(incidents.status, statusParam));
    if (netIdParam) conditions.push(eq(incidents.netId, netIdParam));
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query;
    return c.json(rows);
  })

  // GET /incidents/:id — get with latest activity entries
  // If X-Org-Id is present and incident belongs to a different org, returns 404.
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    const activities = await db
      .select()
      .from(incidentActivities)
      .where(eq(incidentActivities.incidentId, id))
      .orderBy(asc(incidentActivities.createdAt));

    return c.json({ ...row, activities });
  })

  // POST /incidents — create (auth required)
  // If X-Org-Id header is present, validates membership and sets organizationId.
  .post('/', requireAuth, zValidator('json', CreateIncidentSchema), async (c) => {
    const body = c.req.valid('json');
    const operatorId = c.get('operatorId');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    // Validate net_id if provided
    if (body.net_id) {
      const [net] = await db.select({ id: nets.id }).from(nets).where(eq(nets.id, body.net_id)).limit(1);
      if (!net) return c.json({ error: 'net_not_found' }, 422);
    }

    const now = new Date().toISOString();
    const [created] = await db
      .insert(incidents)
      .values({
        id: newId(),
        title: body.title,
        incidentType: body.incident_type,
        activationLevel: body.activation_level,
        servedAgency: body.served_agency,
        description: body.description,
        location: body.location,
        netId: body.net_id,
        createdByOperatorId: operatorId,
        organizationId: orgId,
        status: 'reported',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json(created, 201);
  })

  // PATCH /incidents/:id — update status/metadata (auth required, creator only)
  .patch('/:id', requireAuth, zValidator('json', UpdateIncidentSchema), async (c) => {
    const id = c.req.param('id');
    const operatorId = c.get('operatorId');
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    if (row.createdByOperatorId && row.createdByOperatorId !== operatorId) {
      return c.json({ error: 'Forbidden: only the incident creator may update this incident' }, 403);
    }

    // Enforce forward-only status transitions
    if (body.status !== undefined && body.status !== row.status) {
      const currentOrder = STATUS_ORDER[row.status];
      const newOrder = STATUS_ORDER[body.status];

      // Terminal states: resolved and cancelled cannot transition further
      if (row.status === 'resolved' || row.status === 'cancelled') {
        return c.json({ error: `Conflict: incident is already ${row.status}; no further transitions allowed` }, 409);
      }

      // For the main chain (reported/active/resolved), reject backwards moves
      if (currentOrder !== undefined && newOrder !== undefined && newOrder < currentOrder) {
        return c.json({ error: `Conflict: cannot transition from ${row.status} to ${body.status}` }, 409);
      }

      // cancelled is only allowed from reported or active
      if (body.status === 'cancelled' && (row.status === 'resolved')) {
        return c.json({ error: `Conflict: cannot cancel a resolved incident` }, 409);
      }
    }

    // Validate net_id if being updated
    if (body.net_id !== undefined && body.net_id !== null) {
      const [net] = await db.select({ id: nets.id }).from(nets).where(eq(nets.id, body.net_id)).limit(1);
      if (!net) return c.json({ error: 'net_not_found' }, 422);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.title !== undefined) updates.title = body.title;
    if (body.status !== undefined) updates.status = body.status;
    if (body.incident_type !== undefined) updates.incidentType = body.incident_type;
    if (body.activation_level !== undefined) updates.activationLevel = body.activation_level;
    if (body.served_agency !== undefined) updates.servedAgency = body.served_agency;
    if (body.description !== undefined) updates.description = body.description;
    if (body.location !== undefined) updates.location = body.location;
    if (body.net_id !== undefined) updates.netId = body.net_id;

    const [updated] = await db
      .update(incidents)
      .set(updates)
      .where(eq(incidents.id, id))
      .returning();
    return c.json(updated);
  })

  // POST /incidents/:id/activities — log an activity entry (auth required)
  .post('/:id/activities', requireAuth, zValidator('json', CreateActivitySchema), async (c) => {
    const id = c.req.param('id');
    const operatorId = c.get('operatorId');
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    const now = new Date().toISOString();
    const [created] = await db
      .insert(incidentActivities)
      .values({
        id: newId(),
        incidentId: id,
        operatorId,
        note: body.note,
        createdAt: now,
      })
      .returning();
    return c.json(created, 201);
  })

  // GET /incidents/:id/activities — list activity entries (chronological, optional auth)
  .get('/:id/activities', async (c) => {
    const id = c.req.param('id');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    const activities = await db
      .select()
      .from(incidentActivities)
      .where(eq(incidentActivities.incidentId, id))
      .orderBy(asc(incidentActivities.createdAt));

    return c.json(activities);
  });
