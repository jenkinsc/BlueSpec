import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, sql, getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { nets, checkIns, netEvents } from '../db/schema.js';
import type { NetEventType } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { tryGetOrgId } from '../middleware/org.js';

const MODE_ENUM = ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'] as const;
const STATUS_ENUM = ['draft', 'open', 'closed'] as const;
const TRAFFIC_TYPE_ENUM = ['routine', 'welfare', 'priority', 'emergency'] as const;
const CHECKIN_ROLE_ENUM = ['NET_CONTROL', 'RELAY', 'MOBILE', 'PORTABLE', 'FIXED', 'EOC', 'EMCOMM'] as const;
const CHECKIN_MODE_ENUM = ['SSB', 'FM', 'AM', 'DIGITAL', 'PACKET', 'WINLINK', 'OTHER'] as const;

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

// RST signal report: 2–3 digit string e.g. "59", "579"
const SignalReportSchema = z
  .string()
  .regex(/^\d{2,3}$/, 'signal_report must be a 2–3 digit RST string');

const CreateCheckInSchema = z.object({
  signal_report: SignalReportSchema.optional(),
  traffic_type: z.enum(TRAFFIC_TYPE_ENUM).default('routine'),
  role: z.enum(CHECKIN_ROLE_ENUM).optional(),
  mode: z.enum(CHECKIN_MODE_ENUM).optional(),
  remarks: z.string().optional(),
  operator_callsign: z.string().min(1).optional(),
});

const UpdateCheckInSchema = z.object({
  signal_report: SignalReportSchema.optional(),
  traffic_type: z.enum(TRAFFIC_TYPE_ENUM).optional(),
  role: z.enum(CHECKIN_ROLE_ENUM).optional(),
  mode: z.enum(CHECKIN_MODE_ENUM).optional(),
  remarks: z.string().optional(),
  acknowledged_at: z.string().datetime().optional(),
  // Location fields (BLUAAA-76)
  grid_square: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

// Helper — append a net event row
async function appendNetEvent(
  netId: string,
  eventType: NetEventType,
  operatorId: string | null,
  note?: string,
): Promise<void> {
  await db.insert(netEvents).values({
    id: newId(),
    netId,
    operatorId,
    eventType,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  });
}

const CreateNetEventSchema = z.object({
  note: z.string().min(1),
});

export const netsRouter = new Hono()
  // GET /nets — list nets, optional ?status= filter (default: open)
  // Optional ?includeCounts=true adds checkInCount to each net row.
  // If X-Org-Id header is present, validates membership and filters by org.
  // Without X-Org-Id, returns all nets (public access preserved).
  .get('/', async (c) => {
    const statusParam = c.req.query('status') ?? 'open';
    const parsed = ListStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return c.json({ error: 'Invalid status. Use: draft, open, closed, all' }, 400);
    }
    const filter = parsed.data;
    const includeCounts = c.req.query('includeCounts') === 'true';

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const conditions = [];
    if (orgId) conditions.push(eq(nets.organizationId, orgId));
    if (filter !== 'all') conditions.push(eq(nets.status, filter));

    if (includeCounts) {
      const selectFields = {
        ...getTableColumns(nets),
        checkInCount: sql<number>`count(${checkIns.id})`,
      };
      const baseQuery = db
        .select(selectFields)
        .from(nets)
        .leftJoin(checkIns, eq(checkIns.netId, nets.id))
        .groupBy(nets.id);
      const rows =
        conditions.length > 0
          ? await baseQuery.where(and(...conditions))
          : await baseQuery;
      return c.json(rows);
    }

    const rows =
      conditions.length > 0
        ? await db.select().from(nets).where(and(...conditions))
        : await db.select().from(nets);
    return c.json(rows);
  })

  // GET /nets/:id — get net by id
  // If X-Org-Id is present and net belongs to a different org, returns 404.
  .get('/:id', async (c) => {
    const id = c.req.param('id') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db
      .select()
      .from(nets)
      .where(eq(nets.id, id))
      .limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json(row);
  })

  // POST /nets — create a net in draft status (auth required)
  // If X-Org-Id header is present, validates membership and sets organizationId.
  .post('/', requireAuth, zValidator('json', CreateNetSchema), async (c) => {
    const body = c.req.valid('json');
    const callsign = c.get('callsign') as string;
    const operatorId = c.get('operatorId') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

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
        organizationId: orgId,
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

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

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

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

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
    await appendNetEvent(id, 'net_open', operatorId, `Net opened by ${c.get('callsign') as string}`);
    return c.json(updated);
  })

  // POST /nets/:id/close — transition open → closed (auth required, net_control only)
  .post('/:id/close', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [row] = await db.select().from(nets).where(eq(nets.id, id)).limit(1);
    if (!row) return c.json({ error: 'Not found' }, 404);

    if (orgId && row.organizationId !== orgId) {
      return c.json({ error: 'Not found' }, 404);
    }

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
    await appendNetEvent(id, 'net_close', operatorId, `Net closed by ${c.get('callsign') as string}`);
    return c.json(updated);
  })

  // --- Net-scoped check-in routes ---

  // GET /nets/:netId/check-ins — list check-ins for a net (optional auth)
  // If X-Org-Id is present and net belongs to a different org, returns 404.
  .get('/:netId/check-ins', async (c) => {
    const netId = c.req.param('netId') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Net not found' }, 404);

    if (orgId && net.organizationId !== orgId) {
      return c.json({ error: 'Net not found' }, 404);
    }

    const rows = await db.select().from(checkIns).where(eq(checkIns.netId, netId));
    return c.json(rows);
  })

  // POST /nets/:netId/check-ins — check into an open net (auth required)
  .post('/:netId/check-ins', requireAuth, zValidator('json', CreateCheckInSchema), async (c) => {
    const netId = c.req.param('netId') as string;
    const operatorId = c.get('operatorId') as string;
    const callsign = c.get('callsign') as string;
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    // Verify net exists and is open
    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Net not found' }, 404);

    if (orgId && net.organizationId !== orgId) {
      return c.json({ error: 'Net not found' }, 404);
    }

    if (net.status !== 'open') {
      return c.json({ error: 'net_not_open' }, 409);
    }

    const isNetControl = net.netControlId === operatorId;

    // Determine effective callsign and operatorId for this check-in
    let effectiveCallsign: string;
    let effectiveOperatorId: string | null;

    if (isNetControl && body.operator_callsign) {
      // Net control is checking in a third-party station
      effectiveCallsign = body.operator_callsign.toUpperCase();
      effectiveOperatorId = null;
    } else {
      effectiveCallsign = callsign;
      effectiveOperatorId = operatorId;
    }

    // Enforce unique check-in per callsign per net
    const [existing] = await db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.netId, netId), eq(checkIns.operatorCallsign, effectiveCallsign)))
      .limit(1);
    if (existing) {
      return c.json({ error: 'already_checked_in' }, 409);
    }

    const now = new Date().toISOString();
    const [created] = await db
      .insert(checkIns)
      .values({
        id: newId(),
        netId,
        operatorId: effectiveOperatorId,
        operatorCallsign: effectiveCallsign,
        trafficType: body.traffic_type,
        role: body.role,
        mode: body.mode,
        signalReport: body.signal_report,
        remarks: body.remarks,
        checkedInAt: now,
        updatedAt: now,
      })
      .returning();
    await appendNetEvent(
      netId,
      'check_in',
      effectiveOperatorId,
      `${effectiveCallsign} checked in${body.role ? ` as ${body.role}` : ''}${body.mode ? ` via ${body.mode}` : ''}`,
    );
    return c.json(created, 201);
  })

  // PATCH /nets/:netId/check-ins/:id — update check-in (auth required, net control only)
  .patch('/:netId/check-ins/:id', requireAuth, zValidator('json', UpdateCheckInSchema), async (c) => {
    const netId = c.req.param('netId') as string;
    const checkInId = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    // Verify net exists
    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Net not found' }, 404);

    if (orgId && net.organizationId !== orgId) {
      return c.json({ error: 'Net not found' }, 404);
    }

    // Only net control may update check-ins
    if (net.netControlId !== operatorId) {
      return c.json({ error: 'Forbidden: only the net control operator may update check-ins' }, 403);
    }

    const [checkIn] = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.id, checkInId), eq(checkIns.netId, netId)))
      .limit(1);
    if (!checkIn) return c.json({ error: 'Check-in not found' }, 404);

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.signal_report !== undefined) updates.signalReport = body.signal_report;
    if (body.traffic_type !== undefined) updates.trafficType = body.traffic_type;
    if (body.role !== undefined) updates.role = body.role;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.acknowledged_at !== undefined) updates.acknowledgedAt = body.acknowledged_at;
    // Location fields (BLUAAA-76)
    if (body.grid_square !== undefined) updates.gridSquare = body.grid_square;
    if (body.latitude !== undefined) updates.latitude = body.latitude;
    if (body.longitude !== undefined) updates.longitude = body.longitude;
    if (body.county !== undefined) updates.county = body.county;
    if (body.city !== undefined) updates.city = body.city;
    if (body.state !== undefined) updates.state = body.state;

    const [updated] = await db
      .update(checkIns)
      .set(updates)
      .where(eq(checkIns.id, checkInId))
      .returning();

    // Append granular timeline events for each changed field
    if (body.role !== undefined && body.role !== checkIn.role) {
      await appendNetEvent(netId, 'role_change', operatorId,
        `${checkIn.operatorCallsign} role changed to ${body.role}`);
    }
    if (body.mode !== undefined && body.mode !== checkIn.mode) {
      await appendNetEvent(netId, 'mode_change', operatorId,
        `${checkIn.operatorCallsign} mode changed to ${body.mode}`);
    }
    if (body.traffic_type !== undefined && body.traffic_type !== checkIn.trafficType) {
      await appendNetEvent(netId, 'status_change', operatorId,
        `${checkIn.operatorCallsign} traffic type changed to ${body.traffic_type}`);
    }
    // Emit location_change event if any location field changed
    const locationChanged =
      (body.grid_square !== undefined && body.grid_square !== checkIn.gridSquare) ||
      (body.latitude !== undefined && body.latitude !== checkIn.latitude) ||
      (body.longitude !== undefined && body.longitude !== checkIn.longitude) ||
      (body.county !== undefined && body.county !== checkIn.county) ||
      (body.city !== undefined && body.city !== checkIn.city) ||
      (body.state !== undefined && body.state !== checkIn.state);
    if (locationChanged) {
      const locParts: string[] = [];
      const gs = body.grid_square ?? checkIn.gridSquare;
      const city = body.city ?? checkIn.city;
      const st = body.state ?? checkIn.state;
      if (gs) locParts.push(gs);
      if (city) locParts.push(city);
      if (st) locParts.push(st);
      await appendNetEvent(netId, 'location_change', operatorId,
        `${checkIn.operatorCallsign} location updated${locParts.length ? `: ${locParts.join(', ')}` : ''}`);
    }

    return c.json(updated);
  })

  // DELETE /nets/:netId/check-ins/:id — remove a check-in (auth required, net control only)
  .delete('/:netId/check-ins/:id', requireAuth, async (c) => {
    const netId = c.req.param('netId') as string;
    const checkInId = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    // Verify net exists
    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Net not found' }, 404);

    if (orgId && net.organizationId !== orgId) {
      return c.json({ error: 'Net not found' }, 404);
    }

    // Only net control may remove check-ins
    if (net.netControlId !== operatorId) {
      return c.json({ error: 'Forbidden: only the net control operator may remove check-ins' }, 403);
    }

    const [deleted] = await db
      .delete(checkIns)
      .where(and(eq(checkIns.id, checkInId), eq(checkIns.netId, netId)))
      .returning();
    if (!deleted) return c.json({ error: 'Check-in not found' }, 404);
    await appendNetEvent(netId, 'check_out', operatorId,
      `${deleted.operatorCallsign} removed from net`);
    return c.body(null, 204);
  })

  // --- Net events routes ---

  // GET /nets/:id/events — list all events for a net sorted by createdAt ASC
  .get('/:id/events', async (c) => {
    const netId = c.req.param('id') as string;

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Not found' }, 404);
    if (orgId && net.organizationId !== orgId) return c.json({ error: 'Not found' }, 404);

    const rows = await db
      .select()
      .from(netEvents)
      .where(eq(netEvents.netId, netId))
      .orderBy(asc(netEvents.createdAt));
    return c.json(rows);
  })

  // POST /nets/:id/events — add a manual comment entry (auth required, operator-attributed)
  .post('/:id/events', requireAuth, zValidator('json', CreateNetEventSchema), async (c) => {
    const netId = c.req.param('id') as string;
    const operatorId = c.get('operatorId') as string;
    const callsign = c.get('callsign') as string;
    const body = c.req.valid('json');

    const orgResult = await tryGetOrgId(c);
    if (orgResult instanceof Response) return orgResult;
    const orgId = orgResult;

    const [net] = await db.select().from(nets).where(eq(nets.id, netId)).limit(1);
    if (!net) return c.json({ error: 'Not found' }, 404);
    if (orgId && net.organizationId !== orgId) return c.json({ error: 'Not found' }, 404);

    const [created] = await db
      .insert(netEvents)
      .values({
        id: newId(),
        netId,
        operatorId,
        eventType: 'comment',
        note: `[${callsign}] ${body.note}`,
        createdAt: new Date().toISOString(),
      })
      .returning();
    return c.json(created, 201);
  });
