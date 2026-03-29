import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { organizations, organizationMembers, operators, orgInvites } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';

const INVITE_TTL_HOURS = 72;

async function sendInviteEmail(opts: {
  to: string;
  orgName: string;
  inviterCallsign: string;
  token: string;
}): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? 'none';
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const acceptUrl = `${baseUrl}/invite/${opts.token}`;

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.warn('RESEND_API_KEY not set; skipping email');
      return;
    }
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'EmComm Platform <noreply@emcomm.app>',
      to: opts.to,
      subject: `You've been invited to join ${opts.orgName} on EmComm`,
      html: `
        <p>Hi,</p>
        <p><strong>${opts.inviterCallsign}</strong> has invited you to join <strong>${opts.orgName}</strong> on the EmComm Coordination Platform.</p>
        <p><a href="${acceptUrl}">Accept Invitation</a></p>
        <p>This link expires in ${INVITE_TTL_HOURS} hours.</p>
      `,
    });
  } else {
    logger.info({ to: opts.to, acceptUrl }, 'Invite email (EMAIL_PROVIDER=none, not sent)');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const CreateInviteSchema = z.object({
  email: z.string().email(),
});

// Routes are mounted at /organizations, so paths here are /:orgId/invites and /invites/:token
export const invitesRouter = new Hono()
  // POST /organizations/:orgId/invites — create invite (admin only)
  .post('/:orgId/invites', requireAuth, zValidator('json', CreateInviteSchema), async (c) => {
    const orgId = c.req.param('orgId');
    const operatorId = c.get('operatorId');
    const callsign = c.get('callsign');
    const { email } = c.req.valid('json');

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
      return c.json({ error: 'Forbidden: only org admins may send invites' }, 403);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    // Build a short-lived JWT as the invite token (72h)
    const rawToken = await signToken(
      { sub: `invite:${newId()}`, callsign: `invite:${email}` },
      `${INVITE_TTL_HOURS}h`,
    );
    const tokenHash = hashToken(rawToken);

    const [invite] = await db
      .insert(orgInvites)
      .values({
        id: newId(),
        organizationId: orgId,
        email,
        tokenHash,
        invitedByOperatorId: operatorId,
        expiresAt,
        createdAt: now.toISOString(),
      })
      .returning();

    await sendInviteEmail({
      to: email,
      orgName: org.name,
      inviterCallsign: callsign,
      token: rawToken,
    });

    return c.json({ id: invite.id, email: invite.email, expiresAt: invite.expiresAt }, 201);
  })

  // GET /organizations/invites/:token — validate token, return org + inviter info
  .get('/invites/:token', async (c) => {
    const rawToken = c.req.param('token');
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();

    const [invite] = await db
      .select()
      .from(orgInvites)
      .where(and(eq(orgInvites.tokenHash, tokenHash), isNull(orgInvites.acceptedAt)))
      .limit(1);

    if (!invite) return c.json({ error: 'Invalid or expired invite' }, 404);
    if (invite.expiresAt < now) return c.json({ error: 'Invite expired' }, 410);

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, callsign: organizations.callsign })
      .from(organizations)
      .where(eq(organizations.id, invite.organizationId))
      .limit(1);

    const [inviter] = await db
      .select({ callsign: operators.callsign, name: operators.name })
      .from(operators)
      .where(eq(operators.id, invite.invitedByOperatorId))
      .limit(1);

    return c.json({
      email: invite.email,
      organization: org,
      invitedBy: inviter,
      expiresAt: invite.expiresAt,
    });
  })

  // POST /organizations/invites/:token/accept — accept invite (auth required)
  .post('/invites/:token/accept', requireAuth, async (c) => {
    const rawToken = c.req.param('token');
    const tokenHash = hashToken(rawToken);
    const operatorId = c.get('operatorId');
    const now = new Date().toISOString();

    const [invite] = await db
      .select()
      .from(orgInvites)
      .where(and(eq(orgInvites.tokenHash, tokenHash), isNull(orgInvites.acceptedAt)))
      .limit(1);

    if (!invite) return c.json({ error: 'Invalid or already-used invite' }, 404);
    if (invite.expiresAt < now) return c.json({ error: 'Invite expired' }, 410);

    // Check if caller is already a member
    const [existing] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.operatorId, operatorId),
        ),
      )
      .limit(1);
    if (existing) return c.json({ error: 'already_member' }, 409);

    // Add as member
    await db.insert(organizationMembers).values({
      id: newId(),
      organizationId: invite.organizationId,
      operatorId,
      role: 'member',
      joinedAt: now,
    });

    // Mark invite as accepted
    await db
      .update(orgInvites)
      .set({ acceptedAt: now })
      .where(eq(orgInvites.id, invite.id));

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invite.organizationId))
      .limit(1);

    return c.json({ message: 'Invite accepted', organization: org });
  });
