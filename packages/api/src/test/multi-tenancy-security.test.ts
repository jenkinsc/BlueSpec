/**
 * Multi-tenancy security tests (BLUAAA-38)
 *
 * Verifies that a JWT from Org A cannot read, create, or modify Org B's resources.
 * These tests rely on multi-tenancy API scoping (BLUAAA-37) being complete:
 *   - X-Org-Id request header conveys active org context
 *   - requireOrgMember middleware validates caller is a member of that org
 *   - All resource endpoints (nets, incidents, templates, check-ins) filter by organizationId
 */

import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createTestClient();

// --- Test fixtures ---
// OrgA: operatorA (admin)
// OrgB: operatorB (admin)
// Resources created by each org in their own org context

let tokenA: string; // JWT for operatorA (member of OrgA only)
let tokenB: string; // JWT for operatorB (member of OrgB only)
let orgAId: string;
let orgBId: string;
let netAId: string; // net created in OrgA
let netBId: string; // net created in OrgB
let incidentAId: string; // incident created in OrgA
let incidentBId: string; // incident created in OrgB
let templateAId: string; // template created in OrgA context
let templateBId: string; // template created in OrgB context

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });

  // Register operatorA
  const rA = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'MTSECA', name: 'MT Sec A', password: 'password123' }),
  });
  const dA = (await rA.json()) as { token: string };
  tokenA = dA.token;

  // Register operatorB
  const rB = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'MTSECB', name: 'MT Sec B', password: 'password123' }),
  });
  const dB = (await rB.json()) as { token: string };
  tokenB = dB.token;

  // Create OrgA (operatorA is auto-added as admin)
  const rOrgA = await client.request('/organizations', {
    method: 'POST',
    headers: authed(tokenA),
    body: JSON.stringify({ name: 'Org Alpha', callsign: 'W1ALPHA' }),
  });
  const dOrgA = (await rOrgA.json()) as { id: string };
  orgAId = dOrgA.id;

  // Create OrgB (operatorB is auto-added as admin)
  const rOrgB = await client.request('/organizations', {
    method: 'POST',
    headers: authed(tokenB),
    body: JSON.stringify({ name: 'Org Bravo', callsign: 'W2BRAVO' }),
  });
  const dOrgB = (await rOrgB.json()) as { id: string };
  orgBId = dOrgB.id;

  // Create a net in OrgA context
  const rNetA = await client.request('/nets', {
    method: 'POST',
    headers: authedWithOrg(tokenA, orgAId),
    body: JSON.stringify({ name: 'Alpha Net', frequency: '146.520', mode: 'FM' }),
  });
  const dNetA = (await rNetA.json()) as { id: string };
  netAId = dNetA.id;

  // Create a net in OrgB context
  const rNetB = await client.request('/nets', {
    method: 'POST',
    headers: authedWithOrg(tokenB, orgBId),
    body: JSON.stringify({ name: 'Bravo Net', frequency: '147.000', mode: 'FM' }),
  });
  const dNetB = (await rNetB.json()) as { id: string };
  netBId = dNetB.id;

  // Create an incident in OrgA context
  const rIncA = await client.request('/incidents', {
    method: 'POST',
    headers: authedWithOrg(tokenA, orgAId),
    body: JSON.stringify({
      title: 'Alpha Incident',
      incident_type: 'search_rescue',
      activation_level: 1,
    }),
  });
  const dIncA = (await rIncA.json()) as { id: string };
  incidentAId = dIncA.id;

  // Create an incident in OrgB context
  const rIncB = await client.request('/incidents', {
    method: 'POST',
    headers: authedWithOrg(tokenB, orgBId),
    body: JSON.stringify({
      title: 'Bravo Incident',
      incident_type: 'wildfire',
      activation_level: 2,
    }),
  });
  const dIncB = (await rIncB.json()) as { id: string };
  incidentBId = dIncB.id;

  // Create a template in OrgA context
  const rTplA = await client.request('/templates', {
    method: 'POST',
    headers: authedWithOrg(tokenA, orgAId),
    body: JSON.stringify({ name: 'Alpha Template', frequency: '146.520', mode: 'FM' }),
  });
  const dTplA = (await rTplA.json()) as { id: string };
  templateAId = dTplA.id;

  // Create a template in OrgB context
  const rTplB = await client.request('/templates', {
    method: 'POST',
    headers: authedWithOrg(tokenB, orgBId),
    body: JSON.stringify({ name: 'Bravo Template', frequency: '147.000', mode: 'FM' }),
  });
  const dTplB = (await rTplB.json()) as { id: string };
  templateBId = dTplB.id;
});

function authed(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function authedWithOrg(token: string, orgId: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Org-Id': orgId,
  };
}

// ---------------------------------------------------------------------------
// Org membership validation
// ---------------------------------------------------------------------------

describe('X-Org-Id membership enforcement', () => {
  it('rejects a JWT from Org A when using Org B header on /nets', async () => {
    // operatorA is not a member of OrgB
    const res = await client.request('/nets', {
      headers: authedWithOrg(tokenA, orgBId),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a JWT from Org B when using Org A header on /incidents', async () => {
    const res = await client.request('/incidents', {
      headers: authedWithOrg(tokenB, orgAId),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a JWT from Org A when using Org B header on /templates', async () => {
    const res = await client.request('/templates', {
      headers: authedWithOrg(tokenA, orgBId),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Net isolation
// ---------------------------------------------------------------------------

describe('GET /nets — org-scoped list', () => {
  it('OrgA JWT sees only OrgA nets', async () => {
    const res = await client.request('/nets?status=all', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
    const nets = (await res.json()) as Array<{ id: string }>;
    const ids = nets.map((n) => n.id);
    expect(ids).toContain(netAId);
    expect(ids).not.toContain(netBId);
  });

  it('OrgB JWT sees only OrgB nets', async () => {
    const res = await client.request('/nets?status=all', {
      headers: authedWithOrg(tokenB, orgBId),
    });
    expect(res.status).toBe(200);
    const nets = (await res.json()) as Array<{ id: string }>;
    const ids = nets.map((n) => n.id);
    expect(ids).toContain(netBId);
    expect(ids).not.toContain(netAId);
  });
});

describe('GET /nets/:id — cross-org read blocked', () => {
  it('OrgA JWT cannot fetch OrgB net by ID', async () => {
    const res = await client.request(`/nets/${netBId}`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    // 403 (org mismatch) or 404 (hidden) — both are acceptable
    expect([403, 404]).toContain(res.status);
  });

  it('OrgB JWT cannot fetch OrgA net by ID', async () => {
    const res = await client.request(`/nets/${netAId}`, {
      headers: authedWithOrg(tokenB, orgBId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /nets — cross-org create blocked', () => {
  it('OrgA JWT cannot create a net in OrgB context', async () => {
    const res = await client.request('/nets', {
      method: 'POST',
      headers: authedWithOrg(tokenA, orgBId),
      body: JSON.stringify({ name: 'Infiltrated Net', frequency: '144.200', mode: 'SSB' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /nets/:id — cross-org update blocked', () => {
  it('OrgA JWT cannot update OrgB net', async () => {
    const res = await client.request(`/nets/${netBId}`, {
      method: 'PATCH',
      headers: authedWithOrg(tokenA, orgAId),
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /nets/:id/open — cross-org state change blocked', () => {
  it('OrgA JWT cannot open OrgB net', async () => {
    const res = await client.request(`/nets/${netBId}/open`, {
      method: 'POST',
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Check-in isolation
// ---------------------------------------------------------------------------

describe('GET /nets/:netId/check-ins — cross-org read blocked', () => {
  it('OrgA JWT cannot list check-ins on OrgB net', async () => {
    const res = await client.request(`/nets/${netBId}/check-ins`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /nets/:netId/check-ins — cross-org check-in blocked', () => {
  it('OrgA JWT cannot check in to OrgB net', async () => {
    const res = await client.request(`/nets/${netBId}/check-ins`, {
      method: 'POST',
      headers: authedWithOrg(tokenA, orgAId),
      body: JSON.stringify({ traffic_type: 'routine' }),
    });
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Incident isolation
// ---------------------------------------------------------------------------

describe('GET /incidents — org-scoped list', () => {
  it('OrgA JWT sees only OrgA incidents', async () => {
    const res = await client.request('/incidents', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
    const incidents = (await res.json()) as Array<{ id: string }>;
    const ids = incidents.map((i) => i.id);
    expect(ids).toContain(incidentAId);
    expect(ids).not.toContain(incidentBId);
  });

  it('OrgB JWT sees only OrgB incidents', async () => {
    const res = await client.request('/incidents', {
      headers: authedWithOrg(tokenB, orgBId),
    });
    expect(res.status).toBe(200);
    const incidents = (await res.json()) as Array<{ id: string }>;
    const ids = incidents.map((i) => i.id);
    expect(ids).toContain(incidentBId);
    expect(ids).not.toContain(incidentAId);
  });
});

describe('GET /incidents/:id — cross-org read blocked', () => {
  it('OrgA JWT cannot fetch OrgB incident by ID', async () => {
    const res = await client.request(`/incidents/${incidentBId}`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect([403, 404]).toContain(res.status);
  });

  it('OrgB JWT cannot fetch OrgA incident by ID', async () => {
    const res = await client.request(`/incidents/${incidentAId}`, {
      headers: authedWithOrg(tokenB, orgBId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /incidents — cross-org create blocked', () => {
  it('OrgA JWT cannot create an incident in OrgB context', async () => {
    const res = await client.request('/incidents', {
      method: 'POST',
      headers: authedWithOrg(tokenA, orgBId),
      body: JSON.stringify({ title: 'Intrusion', incident_type: 'other', activation_level: 1 }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /incidents/:id — cross-org update blocked', () => {
  it('OrgA JWT cannot update OrgB incident', async () => {
    const res = await client.request(`/incidents/${incidentBId}`, {
      method: 'PATCH',
      headers: authedWithOrg(tokenA, orgAId),
      body: JSON.stringify({ title: 'Hijacked' }),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /incidents/:id/activities — cross-org activity blocked', () => {
  it('OrgA JWT cannot post activity to OrgB incident', async () => {
    const res = await client.request(`/incidents/${incidentBId}/activities`, {
      method: 'POST',
      headers: authedWithOrg(tokenA, orgAId),
      body: JSON.stringify({ note: 'Unauthorized note' }),
    });
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Template isolation
// ---------------------------------------------------------------------------

describe('GET /templates — org-scoped list', () => {
  it('OrgA JWT sees only OrgA templates', async () => {
    const res = await client.request('/templates', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
    const templates = (await res.json()) as Array<{ id: string }>;
    const ids = templates.map((t) => t.id);
    expect(ids).toContain(templateAId);
    expect(ids).not.toContain(templateBId);
  });

  it('OrgB JWT sees only OrgB templates', async () => {
    const res = await client.request('/templates', {
      headers: authedWithOrg(tokenB, orgBId),
    });
    expect(res.status).toBe(200);
    const templates = (await res.json()) as Array<{ id: string }>;
    const ids = templates.map((t) => t.id);
    expect(ids).toContain(templateBId);
    expect(ids).not.toContain(templateAId);
  });
});

describe('GET /templates/:id — cross-org read blocked', () => {
  it('OrgA JWT cannot fetch OrgB template by ID', async () => {
    const res = await client.request(`/templates/${templateBId}`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('PATCH /templates/:id — cross-org update blocked', () => {
  it('OrgA JWT cannot update OrgB template', async () => {
    const res = await client.request(`/templates/${templateBId}`, {
      method: 'PATCH',
      headers: authedWithOrg(tokenA, orgAId),
      body: JSON.stringify({ name: 'Hijacked Template' }),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('DELETE /templates/:id — cross-org delete blocked', () => {
  it('OrgA JWT cannot delete OrgB template', async () => {
    const res = await client.request(`/templates/${templateBId}`, {
      method: 'DELETE',
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Organization resource access
// ---------------------------------------------------------------------------

describe('GET /organizations/:id — non-member access blocked', () => {
  it('OrgA JWT cannot read OrgB organization details', async () => {
    const res = await client.request(`/organizations/${orgBId}`, {
      headers: authed(tokenA),
    });
    // Non-member should get 403; 404 is acceptable if org is hidden from non-members
    expect([403, 404]).toContain(res.status);
  });

  it('OrgB JWT cannot read OrgA organization details', async () => {
    const res = await client.request(`/organizations/${orgAId}`, {
      headers: authed(tokenB),
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe('POST /organizations/:id/members — cross-org member invite blocked', () => {
  it('OrgA JWT cannot invite members to OrgB', async () => {
    const res = await client.request(`/organizations/${orgBId}/members`, {
      method: 'POST',
      headers: authed(tokenA),
      body: JSON.stringify({ callsign: 'MTSECA', role: 'member' }),
    });
    // Must be 403 — caller is not a member of OrgB
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Positive case: own-org access still works
// ---------------------------------------------------------------------------

describe('Positive: own-org access succeeds', () => {
  it('OrgA JWT can list OrgA nets', async () => {
    const res = await client.request('/nets?status=all', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
  });

  it('OrgA JWT can fetch its own net by ID', async () => {
    const res = await client.request(`/nets/${netAId}`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(netAId);
  });

  it('OrgA JWT can list OrgA incidents', async () => {
    const res = await client.request('/incidents', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
  });

  it('OrgA JWT can fetch its own incident by ID', async () => {
    const res = await client.request(`/incidents/${incidentAId}`, {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(incidentAId);
  });

  it('OrgA JWT can list OrgA templates', async () => {
    const res = await client.request('/templates', {
      headers: authedWithOrg(tokenA, orgAId),
    });
    expect(res.status).toBe(200);
  });
});
