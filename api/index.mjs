import { createAppServer } from '../server.mjs';

const app =
  globalThis.__tiraTimeApp ||
  (globalThis.__tiraTimeApp = createAppServer());

export default async function handler(req, res) {
  return app.handleRequest(req, res);
}
