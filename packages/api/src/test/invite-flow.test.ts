/**
 * Invite flow integration tests (BLUAAA-45)
 *
 * Tests the token-based email invite flow introduced in BLUAAA-43:
 *   - POST /organizations/:orgId/invites     — admin creates a signed invite token (JWT, 72h)
 *   - GET  /organizations/invites/:token     — validate token, return org + inviter info
 *   - POST /organizations/invites/:token/accept — authenticated user accepts, becomes member
 *
 * These tests are written against the spec in the BLUAAA-34 plan.
 * They will pass once BLUAAA-43 (Email invite API + DB migration) is implemented.
 */

import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createTestClient();

// Fixtures:
//   adminOp    — org admin (creates the org + sends invites)
//   inviteeOp  — registered operator who will accept the invite
//   outsiderOp — registered operator who is NOT the invite recipient

let adminToken: string;
let inviteeToken: string;
let outsiderToken: string;
let orgId: string;
let inviteToken: string; // raw JWT token returned by POST /invites

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });

  // Register admin operator
  const rAdmin = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'INVADM', name: 'Invite Admin', password: 'password123' }),
  });
  const dAdmin = (await rAdmin.json()) as { token: string };
  adminToken = dAdmin.token;

  // Register invitee operator (already has an account, will accept via email link)
  const rInvitee = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'INVTEE', name: 'Invite Tee', password: 'password123' }),
  });
  const dInvitee = (await rInvitee.json()) as { token: string };
  inviteeToken = dInvitee.token;

  // Register outsider (different operator, not the invite recipient)
  const rOutsider = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'OUTSDR', name: 'Outsider Op', password: 'password123' }),
  });
  const dOutsider = (await rOutsider.json()) as { token: string };
  outsiderToken = dOutsider.token;

  // Admin creates org (auto-added as admin member)
  const rOrg = await client.request('/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'ARRL Section', callsign: 'W9SEC' }),
  });
  const dOrg = (await rOrg.json()) as { id: string };
  orgId = dOrg.id;
});

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// POST /organizations/:orgId/invites — create invite
// ---------------------------------------------------------------------------

describe('POST /organizations/:orgId/invites — create invite', () => {
  it('requires authentication', async () => {
    const res = await client.request(`/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invitee@example.com' }),
    });
    expect(res.status).toBe(401);
  });

  it('forbids non-admin from creating invite', async () => {
    // inviteeToken belongs to an operator who is not an org member (not admin)
    const res = await client.request(`/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: authHeaders(inviteeToken),
      body: JSON.stringify({ email: 'someone@example.com' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown org', async () => {
    const res = await client.request('/organizations/nonexistent-org/invites', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid email', async () => {
    const res = await client.request(`/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(422);
  });

  it('admin can create an invite and receives an invite token', async () => {
    const res = await client.request(`/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ email: 'invitee@example.com' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; token: string; email: string; expiresAt: string };
    expect(body.email).toBe('invitee@example.com');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    // expiresAt should be roughly 72 hours from now
    const expiresAt = new Date(body.expiresAt);
    const diffHours = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(70);
    expect(diffHours).toBeLessThanOrEqual(73);
    inviteToken = body.token; // save for subsequent tests
  });
});

// ---------------------------------------------------------------------------
// GET /organizations/invites/:token — validate token
// ---------------------------------------------------------------------------

describe('GET /organizations/invites/:token — validate token', () => {
  it('returns 404 for a completely unknown token', async () => {
    const res = await client.request('/organizations/invites/totally-invalid-token');
    expect(res.status).toBe(404);
  });

  it('returns org name and inviter info for a valid token', async () => {
    const res = await client.request(`/organizations/invites/${inviteToken}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: string;
      organization: { id: string; name: string };
      invitedBy: { callsign: string };
      expiresAt: string;
    };
    expect(body.organization.id).toBe(orgId);
    expect(body.organization.name).toBe('ARRL Section');
    expect(body.invitedBy.callsign).toBe('INVADM');
    expect(body.email).toBe('invitee@example.com');
  });
});

// ---------------------------------------------------------------------------
// POST /organizations/invites/:token/accept — accept invite
// ---------------------------------------------------------------------------

describe('POST /organizations/invites/:token/accept — accept invite', () => {
  it('requires authentication to accept', async () => {
    const res = await client.request(`/organizations/invites/${inviteToken}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown token', async () => {
    const res = await client.request('/organizations/invites/bad-token/accept', {
      method: 'POST',
      headers: authHeaders(inviteeToken),
    });
    expect(res.status).toBe(404);
  });

  it('authenticated operator can accept the invite', async () => {
    const res = await client.request(`/organizations/invites/${inviteToken}/accept`, {
      method: 'POST',
      headers: authHeaders(inviteeToken),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { role: string; organizationId: string };
    expect(body.role).toBe('member');
    expect(body.organizationId).toBe(orgId);
  });

  it('operator is now a member of the organization', async () => {
    const res = await client.request(`/organizations/${orgId}`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ callsign?: string; role: string }> };
    const isMember = body.members.some(
      (m) => m.role === 'member',
    );
    expect(isMember).toBe(true);
  });

  it('rejects duplicate accept (token already consumed)', async () => {
    const res = await client.request(`/organizations/invites/${inviteToken}/accept`, {
      method: 'POST',
      headers: authHeaders(inviteeToken),
    });
    // Token was invalidated on first accept
    expect([409, 410]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Expired token rejection
// ---------------------------------------------------------------------------

describe('expired token rejection', () => {
  // We cannot fast-forward real time, so this test uses the API's own validation
  // of a deliberately crafted token whose `exp` claim is in the past.
  // The invite API must sign tokens with JOSE/JWT, so an expired token should
  // fail signature/expiry verification on both GET and POST accept routes.

  // This token string is a structurally valid JWT with exp=1 (Jan 1970, always expired).
  // It will never match a DB record, so the API should reject it before even looking
  // up the database row (or return 410 Gone if the row exists but expiresAt has passed).
  const expiredToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  it('GET validate returns 410 or 404 for expired token', async () => {
    const res = await client.request(`/organizations/invites/${expiredToken}`);
    expect([404, 410]).toContain(res.status);
  });

  it('POST accept returns 410 or 404 for expired token', async () => {
    const res = await client.request(`/organizations/invites/${expiredToken}/accept`, {
      method: 'POST',
      headers: authHeaders(inviteeToken),
    });
    expect([404, 410]).toContain(res.status);
  });

  it('admin-created invite expires after 72 hours (DB expiresAt field present)', async () => {
    // Re-create a fresh invite and verify expiresAt is stored
    const createRes = await client.request(`/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ email: 'expiry-check@example.com' }),
    });
    expect(createRes.status).toBe(201);
    const body = (await createRes.json()) as { expiresAt: string };
    const expiresAt = new Date(body.expiresAt);
    // Must be in the future and within ~72 hours
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const diffHours = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThanOrEqual(73);
  });
});
