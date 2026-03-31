import { serve } from '@hono/node-server';
import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { logger } from './lib/logger.js';
import { initEnv } from './lib/env.js';

initEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, '../drizzle');

// Run pending migrations before accepting traffic
await migrate(db, { migrationsFolder });
logger.info('Database migrations applied.');

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info({ port: info.port }, 'EmComm API listening');
});
