import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { organizations, organizationMembers, operators } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';

const CreateOrgSchema = z.object({
  name: z.string().min(1),
  callsign: z.string().optional(),
});

const InviteMemberSchema = z.object({
  callsign: z.string().min(3).toUpperCase(),
  role: z.enum(['admin', 'member']).default('member'),
});

export const organizationsRouter = new Hono()
  // POST /organizations — create org (auth required; creator becomes admin)
  .post('/', requireAuth, zValidator('json', CreateOrgSchema), async (c) => {
    const operatorId = c.get('operatorId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const [org] = await db
      .insert(organizations)
      .values({
        id: newId(),
        name: body.name,
        callsign: body.callsign,
        createdAt: now,
      })
      .returning();

    // Auto-add creator as admin
    await db.insert(organizationMembers).values({
      id: newId(),
      organizationId: org.id,
      operatorId,
      role: 'admin',
      joinedAt: now,
    });

    return c.json(org, 201);
  })

  // GET /organizations — list orgs where caller is a member (auth required)
  .get('/', requireAuth, async (c) => {
    const operatorId = c.get('operatorId');
    const memberships = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.operatorId, operatorId));

    if (memberships.length === 0) return c.json([]);

    const orgIds = memberships.map((m) => m.organizationId);
    const rows = await db
      .select()
      .from(organizations)
      .where(
        orgIds.length === 1
          ? eq(organizations.id, orgIds[0])
          : eq(organizations.id, orgIds[0]), // fallback; loop below for multiple
      );

    // For multiple orgs, fetch all
    const allOrgs = await Promise.all(
      orgIds.map((id) =>
        db.select().from(organizations).where(eq(organizations.id, id)).limit(1),
      ),
    );
    return c.json(allOrgs.flat());
  })

  // GET /organizations/:id — get org with members
  .get('/:id', requireAuth, async (c) => {
    const id = c.req.param('id');

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!org) return c.json({ error: 'Not found' }, 404);

    const members = await db
      .select({
        id: organizationMembers.id,
        operatorId: organizationMembers.operatorId,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
        callsign: operators.callsign,
        name: operators.name,
      })
      .from(organizationMembers)
      .leftJoin(operators, eq(organizationMembers.operatorId, operators.id))
      .where(eq(organizationMembers.organizationId, id));

    return c.json({ ...org, members });
  })

  // POST /organizations/:id/members — invite member by callsign (admin only)
  .post('/:id/members', requireAuth, zValidator('json', InviteMemberSchema), async (c) => {
    const orgId = c.req.param('id');
    const operatorId = c.get('operatorId');
    const body = c.req.valid('json');

    // Verify org exists
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return c.json({ error: 'Not found' }, 404);

    // Verify caller is admin
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.operatorId, operatorId),
        ),
      )
      .limit(1);
    if (!membership || membership.role !== 'admin') {
      return c.json({ error: 'Forbidden: only org admins may invite members' }, 403);
    }

    // Find operator by callsign
    const [operator] = await db
      .select()
      .from(operators)
      .where(eq(operators.callsign, body.callsign))
      .limit(1);
    if (!operator) return c.json({ error: 'Operator not found' }, 404);

    // Check for duplicate
    const [existing] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.operatorId, operator.id),
        ),
      )
      .limit(1);
    if (existing) return c.json({ error: 'already_member' }, 409);

    const now = new Date().toISOString();
    const [created] = await db
      .insert(organizationMembers)
      .values({
        id: newId(),
        organizationId: orgId,
        operatorId: operator.id,
        role: body.role,
        joinedAt: now,
      })
      .returning();

    return c.json(created, 201);
  })

  // DELETE /organizations/:id/members/:opId — remove member (admin only)
  .delete('/:id/members/:opId', requireAuth, async (c) => {
    const orgId = c.req.param('id');
    const targetOpId = c.req.param('opId');
    const callerOpId = c.get('operatorId');

    // Verify org exists
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return c.json({ error: 'Not found' }, 404);

    // Verify caller is admin
    const [callerMembership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.operatorId, callerOpId),
        ),
      )
      .limit(1);
    if (!callerMembership || callerMembership.role !== 'admin') {
      return c.json({ error: 'Forbidden: only org admins may remove members' }, 403);
    }

    const [deleted] = await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.operatorId, targetOpId),
        ),
      )
      .returning();
    if (!deleted) return c.json({ error: 'Member not found' }, 404);

    return c.body(null, 204);
  });
