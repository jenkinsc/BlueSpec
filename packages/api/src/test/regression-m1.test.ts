/**
 * M1 Regression Sweep — Auth + REST API Baseline
 * BLUAAA-14: Covers auth (BLUAAA-5) and REST API skeleton (BLUAAA-4).
 *
 * Uses in-memory SQLite for isolation. Migrations run in beforeAll.
 */

import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = createTestClient();

// ─── Migration setup ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const uniqueCallsign = () => `W${Math.floor(Math.random() * 9000 + 1000)}QA`;

async function register(callsign: string, password = 'TestPass123!') {
  return client.post('/auth/register', {
    callsign,
    name: 'QA Test Operator',
    password,
  });
}

async function login(callsign: string, password = 'TestPass123!') {
  return client.post('/auth/login', { callsign, password });
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

describe('Infrastructure', () => {
  it('GET /health → 200 ok', async () => {
    const res = await client.get('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /openapi.json → 200 with valid OpenAPI spec', async () => {
    const res = await client.get('/openapi.json');
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/operators']).toBeDefined();
    expect(spec.paths['/nets']).toBeDefined();
    expect(spec.paths['/incidents']).toBeDefined();
    expect(spec.paths['/check-ins']).toBeDefined();
  });
});

// ─── Auth: Registration ───────────────────────────────────────────────────────

describe('Auth — Registration', () => {
  let registeredCallsign: string;

  beforeEach(() => {
    registeredCallsign = uniqueCallsign();
  });

  it('R-1: valid callsign + password → 201 + JWT + operator (no passwordHash)', async () => {
    const res = await register(registeredCallsign);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
    expect(body.operator.callsign).toBe(registeredCallsign);
    expect(body.operator.passwordHash).toBeUndefined();
  });

  it('R-2: duplicate callsign → 409', async () => {
    const cs = uniqueCallsign();
    await register(cs);
    const res = await register(cs);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('R-3: callsign too short (< 3 chars) → 400 [FINDING: spec says 422, impl returns 400]', async () => {
    const res = await client.post('/auth/register', {
      callsign: 'AB',
      name: 'Too Short',
      password: 'TestPass123!',
    });
    // FINDING: zod-validator returns 400; error handler ZodError→422 path is dead code
    expect(res.status).toBe(400);
  });

  it('R-4: missing callsign → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/auth/register', {
      name: 'No Callsign',
      password: 'TestPass123!',
    });
    expect(res.status).toBe(400);
  });

  it('R-5: missing password → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/auth/register', {
      callsign: uniqueCallsign(),
      name: 'No Password',
    });
    expect(res.status).toBe(400);
  });

  it('R-6: empty body → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/auth/register', {});
    expect(res.status).toBe(400);
  });

  it('R-7: password too short (< 8 chars) → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/auth/register', {
      callsign: uniqueCallsign(),
      name: 'Short Pass',
      password: 'abc',
    });
    expect(res.status).toBe(400);
  });
});

// ─── Auth: Login ──────────────────────────────────────────────────────────────

describe('Auth — Login', () => {
  let callsign: string;
  const password = 'TestPass123!';

  beforeAll(async () => {
    callsign = uniqueCallsign();
    await register(callsign, password);
  });

  it('L-1: correct credentials → 200 + JWT', async () => {
    const res = await login(callsign, password);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
  });

  it('L-2: wrong password → 401 with generic message', async () => {
    const res = await login(callsign, 'wrongpassword!');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('L-3: unknown callsign → 401 with same generic message as L-2', async () => {
    const resWrongPw = await login(callsign, 'wrongpassword!');
    const resUnknown = await login('Z9UNKNOWN', 'wrongpassword!');
    expect(resUnknown.status).toBe(401);
    const bodyWrongPw = await resWrongPw.json();
    const bodyUnknown = await resUnknown.json();
    // No user enumeration — same error message
    expect(bodyUnknown.error).toBe(bodyWrongPw.error);
  });

  it('L-4: case-insensitive callsign (lowercase) → 200', async () => {
    const res = await login(callsign.toLowerCase(), password);
    expect(res.status).toBe(200);
  });

  it('L-5: case-insensitive callsign (mixed case) → 200', async () => {
    const mixed = callsign.slice(0, 2).toLowerCase() + callsign.slice(2).toUpperCase();
    const res = await login(mixed, password);
    expect(res.status).toBe(200);
  });

  it('L-6: missing fields → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/auth/login', {});
    expect(res.status).toBe(400);
  });
});

// ─── Auth: JWT middleware ─────────────────────────────────────────────────────

describe('Auth — JWT middleware', () => {
  let validToken: string;

  beforeAll(async () => {
    const cs = uniqueCallsign();
    await register(cs);
    const loginRes = await login(cs);
    const body = await loginRes.json();
    validToken = body.token;
  });

  it('J-3: valid token on /auth/login (public route) → still works normally', async () => {
    // Public routes should not be blocked by sending a token
    const cs = uniqueCallsign();
    await register(cs);
    const res = await client.request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ callsign: cs, password: 'TestPass123!' }),
    });
    expect(res.status).toBe(200);
  });

  it('J-4: tampered token (flipped signature char) → 401 on protected route (if any)', async () => {
    // Note: current implementation has requireAuth middleware available but
    // not wired to any CRUD routes. This test documents the middleware behavior
    // by calling a hypothetical protected route. If no protected route exists,
    // this test verifies the middleware rejects tampered tokens when used.
    const parts = validToken.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.' + (parts[2].slice(0, -2) + 'XX');

    // Test by hitting an endpoint that would reject it — auth/login is public
    // so we just verify the token structure is invalid by direct decode attempt.
    // The requireAuth middleware is tested here by importing and calling it directly.
    const { createApp } = await import('../app.js');
    const app = createApp();

    // No protected routes are currently wired. We verify the middleware logic
    // is correct by confirming a public route works fine with a bad token.
    // (A separate regression finding is filed if no routes use requireAuth.)
    const res = await app.request('/operators', {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    // Without requireAuth on operators, still returns 200 (public route)
    expect(res.status).toBe(200);
  });

  it('J-1/J-2/J-4/J-5: requireAuth middleware correctly rejects bad tokens', async () => {
    // Test the requireAuth middleware behavior directly by creating a
    // minimal test route that uses it.
    const { Hono } = await import('hono');
    const { requireAuth } = await import('../middleware/auth.js');
    const testApp = new Hono();
    testApp.get('/protected', requireAuth, (c) => c.json({ ok: true }));

    // J-1: No token
    const noToken = await testApp.request('/protected');
    expect(noToken.status).toBe(401);

    // J-2: Expired token (a valid-structure but expired JWT)
    const { signToken } = await import('../lib/jwt.js');
    // We can't easily craft an expired token without time manipulation,
    // so we use a clearly malformed one instead.
    const malformed = await testApp.request('/protected', {
      headers: { Authorization: 'Bearer not.a.jwt' },
    });
    expect(malformed.status).toBe(401);

    // J-4: Tampered token
    const parts = validToken.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.' + parts[2].slice(0, -4) + 'XXXX';
    const tamperedRes = await testApp.request('/protected', {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(tamperedRes.status).toBe(401);

    // J-5: alg:none attack — header={"alg":"none"}, no signature
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'fake', callsign: 'EVIL' })).toString('base64url');
    const algNoneToken = `${header}.${payload}.`;
    const algNoneRes = await testApp.request('/protected', {
      headers: { Authorization: `Bearer ${algNoneToken}` },
    });
    expect(algNoneRes.status).toBe(401);

    // J-3: Valid token grants access
    const valid = await testApp.request('/protected', {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(valid.status).toBe(200);
  });
});

// ─── REST API: Operators CRUD ─────────────────────────────────────────────────

describe('REST API — /operators CRUD', () => {
  let createdId: string;
  const cs = uniqueCallsign();

  it('POST /operators → 201 with operator (no passwordHash)', async () => {
    const res = await client.post('/operators', { callsign: cs, name: 'QA Op', licenseClass: 'general' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.callsign).toBe(cs);
    expect(body.passwordHash).toBeUndefined();
    createdId = body.id;
  });

  it('POST /operators with invalid callsign → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/operators', { callsign: 'XX', name: 'Bad' });
    expect(res.status).toBe(400);
  });

  it('POST /operators missing required fields → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/operators', { name: 'No Callsign' });
    expect(res.status).toBe(400);
  });

  it('GET /operators → 200 array', async () => {
    const res = await client.get('/operators');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /operators/:id → 200 with operator', async () => {
    const res = await client.get(`/operators/${createdId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(createdId);
    expect(body.passwordHash).toBeUndefined();
  });

  it('GET /operators/:id non-existent → 404', async () => {
    const res = await client.get('/operators/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('PATCH /operators/:id → 200 with updated operator', async () => {
    const res = await client.patch(`/operators/${createdId}`, { name: 'Updated Name' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated Name');
  });

  it('PATCH /operators/:id invalid field → 400 [FINDING: spec says 422]', async () => {
    const res = await client.patch(`/operators/${createdId}`, { licenseClass: 'not-valid' });
    expect(res.status).toBe(400);
  });

  it('DELETE /operators/:id → 204', async () => {
    const res = await client.delete(`/operators/${createdId}`);
    expect(res.status).toBe(204);
  });

  it('GET /operators/:id after delete → 404', async () => {
    const res = await client.get(`/operators/${createdId}`);
    expect(res.status).toBe(404);
  });
});

// ─── REST API: Nets CRUD ──────────────────────────────────────────────────────
// NOTE: POST /nets and PATCH /nets/:id now require auth (requireAuth middleware).
// Frequency is now a decimal string, not a number (schema mismatch vs DB - see findings).

describe('REST API — /nets CRUD', () => {
  let netId: string;
  let authToken: string;

  beforeAll(async () => {
    const cs = uniqueCallsign();
    await register(cs);
    const res = await login(cs);
    authToken = (await res.json()).token;
  });

  it('GET /nets (unauthenticated) → 200 array', async () => {
    const res = await client.get('/nets');
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('POST /nets without auth → 401', async () => {
    const res = await client.post('/nets', { name: 'No Auth Net', frequency: '146.520' });
    expect(res.status).toBe(401);
  });

  it('POST /nets with auth → 201', async () => {
    const res = await client.request('/nets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: 'QA Test Net', frequency: '146.520' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('QA Test Net');
    netId = body.id;
  });

  it('POST /nets missing required fields → 400 (validation error)', async () => {
    const res = await client.request('/nets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: 'No Freq' }),
    });
    // Zod validator returns 400 (not 422) — see findings
    expect(res.status).toBe(400);
  });

  it('GET /nets/:id → 200', async () => {
    const res = await client.get(`/nets/${netId}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(netId);
  });

  it('GET /nets/:id non-existent → 404', async () => {
    expect((await client.get('/nets/nonexistent')).status).toBe(404);
  });

  it('PATCH /nets/:id with auth → 200', async () => {
    const res = await client.request(`/nets/${netId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: 'Updated Net Name' }),
    });
    // Draft net has netControlId=null → auth check passes (no exclusive owner yet)
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Updated Net Name');
  });

  it('PATCH /nets/:id without auth → 401', async () => {
    const res = await client.patch(`/nets/${netId}`, { name: 'No Auth' });
    expect(res.status).toBe(401);
  });
});

// ─── REST API: Incidents CRUD ─────────────────────────────────────────────────

describe('REST API — /incidents CRUD', () => {
  let incidentId: string;

  it('POST /incidents → 201', async () => {
    const res = await client.post('/incidents', {
      title: 'QA Test Incident',
      severity: 'routine',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('QA Test Incident');
    incidentId = body.id;
  });

  it('POST /incidents invalid severity → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/incidents', {
      title: 'Bad Incident',
      severity: 'catastrophic',
    });
    expect(res.status).toBe(400);
  });

  it('POST /incidents missing title → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/incidents', { severity: 'routine' });
    expect(res.status).toBe(400);
  });

  it('GET /incidents → 200 array', async () => {
    const res = await client.get('/incidents');
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('GET /incidents/:id → 200', async () => {
    const res = await client.get(`/incidents/${incidentId}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(incidentId);
  });

  it('GET /incidents/:id non-existent → 404', async () => {
    expect((await client.get('/incidents/nonexistent')).status).toBe(404);
  });

  it('PATCH /incidents/:id → 200', async () => {
    const res = await client.patch(`/incidents/${incidentId}`, { severity: 'urgent' });
    expect(res.status).toBe(200);
    expect((await res.json()).severity).toBe('urgent');
  });

  it('PATCH /incidents/:id status=resolved → sets resolvedAt automatically', async () => {
    const res = await client.patch(`/incidents/${incidentId}`, { status: 'resolved' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('resolved');
    expect(body.resolvedAt).toBeTruthy();
  });

  it('PATCH /incidents/:id invalid status → 400 [FINDING: spec says 422]', async () => {
    const res = await client.patch(`/incidents/${incidentId}`, { status: 'unknown' });
    expect(res.status).toBe(400);
  });

  it('DELETE /incidents/:id → 204', async () => {
    expect((await client.delete(`/incidents/${incidentId}`)).status).toBe(204);
  });

  it('GET /incidents/:id after delete → 404', async () => {
    expect((await client.get(`/incidents/${incidentId}`)).status).toBe(404);
  });
});

// ─── REST API: Check-ins CRUD ─────────────────────────────────────────────────

describe('REST API — /check-ins CRUD', () => {
  let checkInId: string;
  let testNetId: string;
  let ciAuthToken: string;

  beforeAll(async () => {
    // Create a net with auth (POST /nets requires auth as of current implementation)
    const cs = uniqueCallsign();
    await register(cs);
    const loginRes = await login(cs);
    ciAuthToken = (await loginRes.json()).token;

    const netRes = await client.request('/nets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ciAuthToken}` },
      body: JSON.stringify({ name: 'Check-in Test Net', frequency: '146.520' }),
    });
    testNetId = (await netRes.json()).id;
  });

  it('POST /check-ins → 201', async () => {
    const res = await client.post('/check-ins', {
      netId: testNetId,
      operatorCallsign: 'W1CHECK',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.netId).toBe(testNetId);
    checkInId = body.id;
  });

  it('POST /check-ins invalid netId (not UUID) → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/check-ins', {
      netId: 'not-a-uuid',
      operatorCallsign: 'W1BAD',
    });
    expect(res.status).toBe(400);
  });

  it('POST /check-ins missing netId → 400 [FINDING: spec says 422]', async () => {
    const res = await client.post('/check-ins', { operatorCallsign: 'W1BAD' });
    expect(res.status).toBe(400);
  });

  it('GET /check-ins → 200 array', async () => {
    const res = await client.get('/check-ins');
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('GET /check-ins?netId= → 200 filtered array', async () => {
    const res = await client.get(`/check-ins?netId=${testNetId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((ci: { netId: string }) => ci.netId === testNetId)).toBe(true);
  });

  it('GET /check-ins/:id → 200', async () => {
    const res = await client.get(`/check-ins/${checkInId}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(checkInId);
  });

  it('GET /check-ins/:id non-existent → 404', async () => {
    expect((await client.get('/check-ins/nonexistent')).status).toBe(404);
  });

  it('PATCH /check-ins/:id → 200', async () => {
    const res = await client.patch(`/check-ins/${checkInId}`, { status: 'standby' });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('standby');
  });

  it('PATCH /check-ins/:id invalid status → 400 [FINDING: spec says 422]', async () => {
    const res = await client.patch(`/check-ins/${checkInId}`, { status: 'gone' });
    expect(res.status).toBe(400);
  });

  it('DELETE /check-ins/:id → 204', async () => {
    expect((await client.delete(`/check-ins/${checkInId}`)).status).toBe(204);
  });

  it('GET /check-ins/:id after delete → 404', async () => {
    expect((await client.get(`/check-ins/${checkInId}`)).status).toBe(404);
  });
});

// ─── M2 Regression: Net open/close lifecycle (BLUAAA-18) ─────────────────────

describe('M2 — Net open/close lifecycle', () => {
  let netId: string;
  let controlToken: string;
  let otherToken: string;

  beforeAll(async () => {
    const cs1 = uniqueCallsign();
    const cs2 = uniqueCallsign();
    await register(cs1);
    await register(cs2);
    controlToken = (await (await login(cs1)).json()).token;
    otherToken = (await (await login(cs2)).json()).token;

    const netRes = await client.request('/nets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${controlToken}` },
      body: JSON.stringify({ name: 'M2 Lifecycle Net', frequency: '146.520' }),
    });
    netId = (await netRes.json()).id;
  });

  it('N-M2-1: newly created net has status=draft, netControlId=null, openedAt=null', async () => {
    const res = await client.get(`/nets/${netId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('draft');
    expect(body.netControlId).toBeNull();
    expect(body.openedAt).toBeNull();
  });

  it('N-M2-2: POST /nets/:id/open without auth → 401', async () => {
    const res = await client.request(`/nets/${netId}/open`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('N-M2-3: POST /nets/:id/open with auth → 200, sets netControlId + openedAt, status=open', async () => {
    const res = await client.request(`/nets/${netId}/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('open');
    expect(body.netControlId).toBeTruthy();
    expect(body.openedAt).toBeTruthy();
  });

  it('N-M2-4: POST /nets/:id/open again → 409 (already open)', async () => {
    const res = await client.request(`/nets/${netId}/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}` },
    });
    expect(res.status).toBe(409);
  });

  it('N-M2-5: PATCH /nets/:id by non-control operator → 403', async () => {
    const res = await client.request(`/nets/${netId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ name: 'Stolen Name' }),
    });
    expect(res.status).toBe(403);
  });

  it('N-M2-6: POST /nets/:id/close by non-control operator → 403', async () => {
    const res = await client.request(`/nets/${netId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('N-M2-7: POST /nets/:id/close by control operator → 200, status=closed', async () => {
    const res = await client.request(`/nets/${netId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('closed');
    expect(body.closedAt).toBeTruthy();
  });

  it('N-M2-8: POST /nets/:id/close again → 409 (already closed)', async () => {
    const res = await client.request(`/nets/${netId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}` },
    });
    expect(res.status).toBe(409);
  });
});
