import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizationMembers } from '../db/schema.js';
import { verifyToken } from '../lib/jwt.js';

/**
 * Resolves org context from the X-Org-Id request header.
 *
 * - If the header is absent, returns null (no org scoping — caller retains existing behavior).
 * - If the header is present, validates auth (from JWT or already-set context) and checks
 *   that the authenticated operator is a member of the specified org.
 *   On success returns the orgId string.
 *   On failure returns a Response (401 or 403) that the route handler must return immediately.
 *
 * Usage after requireAuth:
 *   const orgResult = await tryGetOrgId(c);
 *   if (orgResult instanceof Response) return orgResult;
 *   const orgId = orgResult; // string | null
 *
 * Usage in public GET routes (no requireAuth):
 *   Same pattern — tryGetOrgId will verify the JWT itself when X-Org-Id is present.
 */
export async function tryGetOrgId(c: Context): Promise<string | null | Response> {
  const orgHeader = c.req.header('X-Org-Id');
  if (!orgHeader) return null;

  // Resolve operatorId — either already set by requireAuth or parse from JWT now
  let operatorId = c.get('operatorId') as string | undefined;
  if (!operatorId) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const payload = await verifyToken(authHeader.slice(7));
      operatorId = payload.sub;
      c.set('operatorId', operatorId);
      c.set('callsign', payload.callsign);
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  }

  // Validate org membership
  const [membership] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgHeader),
        eq(organizationMembers.operatorId, operatorId),
      ),
    )
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Forbidden: not a member of this organization' }, 403);
  }

  return orgHeader;
}
