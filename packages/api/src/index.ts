import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`EmComm API listening on http://localhost:${info.port}`);
});
