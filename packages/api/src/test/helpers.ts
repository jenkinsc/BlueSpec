import { createApp } from '../app.js';

/**
 * Creates an in-process test client backed by the Hono app.
 * No network port is opened — requests go directly through the fetch interface.
 */
export function createTestClient() {
  const app = createApp();
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init);
    },
    get(path: string) {
      return app.request(path);
    },
    post(path: string, body: unknown) {
      return app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    patch(path: string, body: unknown) {
      return app.request(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    delete(path: string) {
      return app.request(path, { method: 'DELETE' });
    },
  };
}
