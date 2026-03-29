import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
const { hash, compare } = bcrypt;
import { z } from 'zod';
import { db } from '../db/index.js';
import { operators } from '../db/schema.js';
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
  });
