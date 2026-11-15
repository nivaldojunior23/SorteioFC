import { createAppServer } from '../server.mjs';

const app =
  globalThis.__sorteioFcApp ||
  (globalThis.__sorteioFcApp = createAppServer());

export default async function handler(req, res) {
  return app.handleRequest(req, res);
}
