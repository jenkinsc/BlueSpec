import { Hono } from 'hono';
import { operatorsRouter } from './routes/operators.js';
import { incidentsRouter } from './routes/incidents.js';
import { netsRouter } from './routes/nets.js';
import { checkInsRouter } from './routes/checkins.js';
import { templatesRouter } from './routes/templates.js';
import { authRouter } from './routes/auth.js';
import { uiRouter, dashboardRoute } from './routes/ui.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/error.js';
import { openApiSpec } from './openapi.js';

export function createApp() {
  const app = new Hono();

  app.use('*', requestLogger);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/openapi.json', (c) => c.json(openApiSpec));

  // Auth (public)
  app.route('/auth', authRouter);

  // Web UI
  app.route('/', dashboardRoute);
  app.route('/ui', uiRouter);

  // API routes (public reads; auth enforced per-route where needed)
  app.route('/operators', operatorsRouter);
  app.route('/incidents', incidentsRouter);
  app.route('/nets', netsRouter);
  app.route('/check-ins', checkInsRouter);
  app.route('/templates', templatesRouter);

  app.onError(errorHandler);

  return app;
}

export type AppType = ReturnType<typeof createApp>;
