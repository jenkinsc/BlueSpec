/**
 * Integration test scaffold for /operators routes.
 * Uses the Hono app's in-process fetch — no real HTTP server is started.
 * The db/index.ts singleton connects to `file:emcomm.db` by default;
 * set DATABASE_URL=file::memory: in the test environment for isolation.
 */
import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { createTestClient } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = createTestClient();

beforeAll(async () => {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await client.get('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

describe('GET /openapi.json', () => {
  it('returns OpenAPI spec', async () => {
    const res = await client.get('/openapi.json');
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/operators']).toBeDefined();
  });
});

describe('/operators CRUD', () => {
  let createdId: string;

  it('POST /operators creates an operator', async () => {
    const res = await client.post('/operators', {
      callsign: 'W9TEST',
      name: 'Test Operator',
      licenseClass: 'general',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.callsign).toBe('W9TEST');
    expect(body.passwordHash).toBeUndefined();
    createdId = body.id;
  });

  it('GET /operators lists operators', async () => {
    const res = await client.get('/operators');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /operators/:id returns the operator', async () => {
    const res = await client.get(`/operators/${createdId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(createdId);
  });

  it('PATCH /operators/:id updates name', async () => {
    const res = await client.patch(`/operators/${createdId}`, { name: 'Updated Name' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated Name');
  });

  it('DELETE /operators/:id removes the operator', async () => {
    const res = await client.delete(`/operators/${createdId}`);
    expect(res.status).toBe(204);
  });

  it('GET /operators/:id returns 404 after delete', async () => {
    const res = await client.get(`/operators/${createdId}`);
    expect(res.status).toBe(404);
  });
});
