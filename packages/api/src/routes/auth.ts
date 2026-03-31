import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
const { hash, compare } = bcrypt;
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  operators,
  organizations,
  organizationMembers,
  nets,
  checkIns,
  incidents,
} from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { signToken } from '../lib/jwt.js';

const RegisterSchema = z.object({
  callsign: z.string().min(3).max(10).toUpperCase(),
  name: z.string().min(1),
  password: z.string().min(8),
  email: z.string().email().optional(),
  licenseClass: z.enum(['technician', 'general', 'extra']).optional(),
});

const LoginSchema = z.object({
  callsign: z.string().toUpperCase(),
  password: z.string(),
});

export const authRouter = new Hono()
  // POST /auth/register
  .post('/register', zValidator('json', RegisterSchema), async (c) => {
    const body = c.req.valid('json');

    const [existing] = await db
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.callsign, body.callsign))
      .limit(1);

    if (existing) {
      return c.json({ error: 'Callsign already registered' }, 409);
    }

    const passwordHash = await hash(body.password, 12);
    const now = new Date().toISOString();
    const [created] = await db
      .insert(operators)
      .values({
        id: newId(),
        callsign: body.callsign,
        name: body.name,
        email: body.email,
        licenseClass: body.licenseClass,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const token = await signToken({ sub: created.id, callsign: created.callsign });
    const { passwordHash: _, ...operator } = created;
    return c.json({ token, operator }, 201);
  })

  // POST /auth/login
  .post('/login', zValidator('json', LoginSchema), async (c) => {
    const { callsign, password } = c.req.valid('json');

    const [row] = await db
      .select()
      .from(operators)
      .where(eq(operators.callsign, callsign))
      .limit(1);

    if (!row?.passwordHash) {
      return c.json({ error: 'Invalid callsign or password' }, 401);
    }

    const valid = await compare(password, row.passwordHash);
    if (!valid) {
      return c.json({ error: 'Invalid callsign or password' }, 401);
    }

    const token = await signToken({ sub: row.id, callsign: row.callsign });
    const { passwordHash: _, ...operator } = row;
    return c.json({ token, operator });
  })

  // POST /auth/demo — create a throwaway demo account pre-seeded with sample data
  .post('/demo', async (c) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Generate unique demo callsign
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const callsign = `DEMO${suffix}`;
    const opId = newId();
    const orgId = newId();
    const nowIso = now.toISOString();

    // Create demo operator (no password — demo only)
    const [demoOp] = await db
      .insert(operators)
      .values({
        id: opId,
        callsign,
        name: `Demo User (${suffix})`,
        email: null,
        licenseClass: null,
        passwordHash: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();

    // Create demo org
    const [_demoOrg] = await db
      .insert(organizations)
      .values({
        id: orgId,
        name: `${callsign} Demo Org`,
        callsign: null,
        createdAt: nowIso,
      })
      .returning();

    // Make demo op admin of the org
    await db.insert(organizationMembers).values({
      id: newId(),
      organizationId: orgId,
      operatorId: opId,
      role: 'admin',
      joinedAt: nowIso,
    });

    // Seed: 1 open net
    const netId = newId();
    await db.insert(nets).values({
      id: netId,
      name: 'Demo Weekly Net',
      frequency: 146.52,
      mode: 'FM',
      schedule: 'Sundays 19:00 local',
      netControl: callsign,
      netControlId: opId,
      status: 'open',
      organizationId: orgId,
      openedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Seed: 3 check-ins
    const demoCallsigns = ['W1DEMO', 'KD9DEMO', 'N5DEMO'];
    for (const cs of demoCallsigns) {
      await db.insert(checkIns).values({
        id: newId(),
        netId,
        operatorId: null,
        operatorCallsign: cs,
        trafficType: 'routine',
        signalReport: '59',
        remarks: null,
        checkedInAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // Seed: 1 active incident
    await db.insert(incidents).values({
      id: newId(),
      title: 'Demo Severe Weather Watch',
      description: 'Demo incident for evaluation purposes.',
      severity: null,
      status: 'active',
      location: 'Demo County',
      incidentType: 'weather',
      activationLevel: 1,
      servedAgency: 'Demo ARES',
      netId,
      createdByOperatorId: opId,
      organizationId: orgId,
      createdAt: nowIso,
      updatedAt: nowIso,
      resolvedAt: null,
    });

    const token = await signToken({ sub: demoOp.id, callsign: demoOp.callsign }, '24h');
    const { passwordHash: _, ...operator } = demoOp;
    return c.json({ token, operator, demo: true, expiresAt }, 201);
  });
