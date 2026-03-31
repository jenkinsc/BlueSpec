import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createTestClient();

let adminToken: string;
let memberToken: string;
let adminOpId: string;
let memberOpId: string;
let orgId: string;
let _membershipId: string;

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });

  const r1 = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'ORGADM', name: 'Org Admin', password: 'password123' }),
  });
  const d1 = (await r1.json()) as { token: string; operator: { id: string } };
  adminToken = d1.token;
  adminOpId = d1.operator.id;

  const r2 = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'ORGMBR', name: 'Org Member', password: 'password123' }),
  });
  const d2 = (await r2.json()) as { token: string; operator: { id: string } };
  memberToken = d2.token;
  memberOpId = d2.operator.id;
});

function authHeaders(t: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
}

describe('POST /organizations', () => {
  it('requires auth', async () => {
    const res = await client.request('/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Org' }),
    });
    expect(res.status).toBe(401);
  });

  it('creates org and auto-adds creator as admin', async () => {
    const res = await client.request('/organizations', {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ name: 'W9 ARES Group', callsign: 'W9ARES' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe('W9 ARES Group');
    orgId = body.id;
  });
});

describe('GET /organizations/:id', () => {
  it('returns org with members', async () => {
    const res = await client.request(`/organizations/${orgId}`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; members: Array<{ role: string }> };
    expect(body.id).toBe(orgId);
    expect(body.members.length).toBe(1);
    expect(body.members[0].role).toBe('admin');
  });

  it('returns 404 for unknown org', async () => {
    const res = await client.request('/organizations/nonexistent', {
      headers: authHeaders(adminToken),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /organizations/:id/members', () => {
  it('forbids non-admin from inviting', async () => {
    // memberToken has not joined yet - but let's use the member callsign as inviter (not admin)
    // First add them and then try with their token
    const res = await client.request(`/organizations/${orgId}/members`, {
      method: 'POST',
      headers: authHeaders(memberToken),
      body: JSON.stringify({ callsign: 'ORGADM' }),
    });
    expect(res.status).toBe(403);
  });

  it('admin can invite member by callsign', async () => {
    const res = await client.request(`/organizations/${orgId}/members`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ callsign: 'ORGMBR', role: 'member' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; role: string; operatorId: string };
    expect(body.role).toBe('member');
    expect(body.operatorId).toBe(memberOpId);
    _membershipId = body.id;
  });

  it('returns 409 on duplicate invite', async () => {
    const res = await client.request(`/organizations/${orgId}/members`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ callsign: 'ORGMBR' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown callsign', async () => {
    const res = await client.request(`/organizations/${orgId}/members`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ callsign: 'NOEXST' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /organizations/:id/members/:opId', () => {
  it('forbids non-admin from removing', async () => {
    const res = await client.request(`/organizations/${orgId}/members/${adminOpId}`, {
      method: 'DELETE',
      headers: authHeaders(memberToken),
    });
    expect(res.status).toBe(403);
  });

  it('admin can remove a member', async () => {
    const res = await client.request(`/organizations/${orgId}/members/${memberOpId}`, {
      method: 'DELETE',
      headers: authHeaders(adminToken),
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 after removal', async () => {
    const res = await client.request(`/organizations/${orgId}/members/${memberOpId}`, {
      method: 'DELETE',
      headers: authHeaders(adminToken),
    });
    expect(res.status).toBe(404);
  });
});
