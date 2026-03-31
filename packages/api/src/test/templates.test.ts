import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createTestClient();

let token: string;
let token2: string;
let templateId: string;

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });

  // Register two operators for ownership tests
  const r1 = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'TMPL1', name: 'Template User 1', password: 'password123' }),
  });
  const d1 = (await r1.json()) as { token: string };
  token = d1.token;

  const r2 = await client.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsign: 'TMPL2', name: 'Template User 2', password: 'password123' }),
  });
  const d2 = (await r2.json()) as { token: string };
  token2 = d2.token;
});

function authHeaders(t: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
}

describe('POST /templates', () => {
  it('requires auth', async () => {
    const res = await client.request('/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sunday Net', frequency: '146.520', mode: 'FM' }),
    });
    expect(res.status).toBe(401);
  });

  it('creates a template', async () => {
    const res = await client.request('/templates', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Sunday Net',
        frequency: '146.520',
        mode: 'FM',
        region: 'South',
        notes: 'Weekly net',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      frequency: string;
      mode: string;
    };
    expect(body.name).toBe('Sunday Net');
    expect(body.frequency).toBe('146.520');
    expect(body.mode).toBe('FM');
    templateId = body.id;
  });
});

describe('GET /templates', () => {
  it('requires auth', async () => {
    const res = await client.get('/templates');
    expect(res.status).toBe(401);
  });

  it('lists only own templates', async () => {
    const res = await client.request('/templates', { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((t) => t.id === templateId)).toBe(true);

    // user2 sees empty list
    const res2 = await client.request('/templates', { headers: authHeaders(token2) });
    const body2 = (await res2.json()) as Array<unknown>;
    expect(body2.length).toBe(0);
  });
});

describe('GET /templates/:id', () => {
  it('returns the template by id', async () => {
    const res = await client.get(`/templates/${templateId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(templateId);
  });

  it('returns 404 for unknown id', async () => {
    const res = await client.get('/templates/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /templates/:id', () => {
  it('updates own template', async () => {
    const res = await client.request(`/templates/${templateId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Updated Net', frequency: '147.000' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; frequency: string };
    expect(body.name).toBe('Updated Net');
    expect(body.frequency).toBe('147.000');
  });

  it('forbids update by non-owner', async () => {
    const res = await client.request(`/templates/${templateId}`, {
      method: 'PATCH',
      headers: authHeaders(token2),
      body: JSON.stringify({ name: 'Stolen Net' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /templates/:id', () => {
  it('forbids delete by non-owner', async () => {
    const res = await client.request(`/templates/${templateId}`, {
      method: 'DELETE',
      headers: authHeaders(token2),
    });
    expect(res.status).toBe(403);
  });

  it('owner can delete', async () => {
    const res = await client.request(`/templates/${templateId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 after delete', async () => {
    const res = await client.get(`/templates/${templateId}`);
    expect(res.status).toBe(404);
  });
});
