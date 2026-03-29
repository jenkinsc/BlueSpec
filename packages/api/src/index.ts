import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { initEnv } from './lib/env.js';

initEnv();

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info({ port: info.port }, 'EmComm API listening');
});
