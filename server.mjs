import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PeladaStore } from './lib/db.mjs';
import { PostgresStore, resolvePostgresUrl } from './lib/pg-store.mjs';
import { parseWhatsAppList } from './lib/parser.mjs';
import { formatTeamsForWhatsApp } from './lib/draw.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // Ignore unreadable .env
  }
}
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3010);
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

export function createAppServer({ dbPath, postgresUrl, store: customStore } = {}) {
  const resolvedPgUrl = customStore ? '' : resolvePostgresUrl(postgresUrl);
  const store = customStore || (resolvedPgUrl ? new PostgresStore(resolvedPgUrl) : new PeladaStore(dbPath));
  const storageMode = customStore
    ? 'custom'
    : resolvedPgUrl
      ? 'postgres'
      : process.env.VERCEL
        ? 'ephemeral'
        : 'sqlite';
  const sseClients = new Map(); // slug -> Set<res>

  // Simple in-memory brute-force protection for room PINs
  const authFailures = new Map(); // key -> { count, firstAt }
  const AUTH_WINDOW_MS = 10 * 60 * 1000;
  const AUTH_MAX_FAILURES = 10;
  function isAuthLocked(key) {
    const entry = authFailures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > AUTH_WINDOW_MS) {
      authFailures.delete(key);
      return false;
    }
    return entry.count >= AUTH_MAX_FAILURES;
  }
  function registerAuthFailure(key) {
    const entry = authFailures.get(key);
    if (!entry || Date.now() - entry.firstAt > AUTH_WINDOW_MS) {
      authFailures.set(key, { count: 1, firstAt: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  function broadcast(slug, eventName, payload) {
    const set = sseClients.get(slug);
    if (!set || set.size === 0) return;
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(message);
      } catch {
        set.delete(res);
      }
    }
  }

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  }

  async function readBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 1024 * 1024) {
        throw new Error('Payload excedeu o limite de 1MB.');
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('JSON inválido no corpo da requisição.');
    }
  }

  function getAuthFromReq(req) {
    return {
      adminPin: typeof req.headers['x-admin-pin'] === 'string' ? req.headers['x-admin-pin'] : '',
      adminToken: typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'] : ''
    };
  }

  const notFoundError =
    storageMode === 'ephemeral'
      ? 'Pelada não encontrada. A Vercel está usando armazenamento temporário — conecte um banco Postgres (Neon) gratuito na aba Storage.'
      : 'Pelada não encontrada.';

  async function requireAdmin(slug, req, res) {
    const raw = await store.getMatchRaw(slug);
    if (!raw) {
      sendJson(res, 404, { error: notFoundError });
      return null;
    }
    const auth = getAuthFromReq(req);
    if (!store.isAuthorized(raw, auth)) {
      sendJson(res, 401, { error: 'PIN ou token do organizador inválido.' });
      return null;
    }
    return raw;
  }

  function getBoundPort() {
    const addr = server.address();
    return addr && typeof addr === 'object' && addr.port ? addr.port : PORT;
  }

  function getLanUrls(reqHostHeader) {
    if (process.env.VERCEL) return [];
    const activePort = getBoundPort();
    const interfaces = os.networkInterfaces();
    const urls = [];
    for (const list of Object.values(interfaces)) {
      for (const iface of list || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          urls.push(`http://${iface.address}:${activePort}`);
        }
      }
    }
    if (reqHostHeader && !reqHostHeader.startsWith('localhost') && !reqHostHeader.startsWith('127.0.0.1')) {
      const origin = `http://${reqHostHeader}`;
      if (!urls.includes(origin)) urls.unshift(origin);
    }
    return urls;
  }

  function serveStaticFile(reqPath, res) {
    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const candidates = [
      path.join(DIST_DIR, safePath),
      path.join(PUBLIC_DIR, safePath)
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': ext === '.html' || safePath.endsWith('sw.js') ? 'no-store' : 'public, max-age=3600'
        });
        fs.createReadStream(filePath).pipe(res);
        return true;
      }
    }

    // SPA fallback to dist/index.html
    const indexHtml = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(indexHtml).pipe(res);
      return true;
    }
    return false;
  }

  async function handleRequest(req, res) {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method || 'GET';

      // Baseline HTTP security headers
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');

      // Explicit CORS handling (only configured origin or local dev server)
      const configuredOrigin = process.env.CORS_ORIGIN || '';
      const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
      const allowedOrigin =
        configuredOrigin ||
        (process.argv.includes('--dev') && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin)
          ? reqOrigin
          : '');
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin, x-admin-token');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, { ok: true, service: 'sorteiofc', storage: storageMode });
      }

      if (pathname === '/api/network-info' && method === 'GET') {
        const auth = getAuthFromReq(req);
        const matches = await store.listMatches();
        let isAnyAdmin = false;
        if (auth.adminToken || auth.adminPin) {
          for (const m of matches) {
            if (store.isAuthorized(await store.getMatchRaw(m.slug), auth)) {
              isAnyAdmin = true;
              break;
            }
          }
        }
        return sendJson(res, 200, {
          port: getBoundPort(),
          lanUrls: isAnyAdmin ? getLanUrls(req.headers.host) : []
        });
      }

      if (pathname === '/api/parse-preview' && method === 'POST') {
        const body = await readBody(req);
        const parsed = parseWhatsAppList(body.rawList || '');
        return sendJson(res, 200, parsed);
      }

      if (pathname === '/api/matches' && method === 'GET') {
        // No global listing (privacy): the browser asks only for the rooms it already knows.
        const slugs = (url.searchParams.get('slugs') || '').split(',');
        return sendJson(res, 200, { matches: await store.listMatchesBySlugs(slugs) });
      }

      if (pathname === '/api/matches' && method === 'POST') {
        const body = await readBody(req);
        const created = await store.createMatch(body);
        return sendJson(res, 201, { match: created });
      }

      // Match-scoped routes
      const matchPrefix = pathname.match(/^\/api\/matches\/([^/]+)(\/.*)?$/);
      if (matchPrefix) {
        const slug = decodeURIComponent(matchPrefix[1]).trim().toLowerCase();
        const subPath = matchPrefix[2] || '';

        if (subPath === '' && method === 'GET') {
          const auth = getAuthFromReq(req);
          const match = await store.getMatchForClient(slug, auth);
          if (!match) return sendJson(res, 404, { error: notFoundError });
          return sendJson(res, 200, { match });
        }

        if (subPath === '' && method === 'DELETE') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const deleted = await store.deleteMatch(slug);
          if (!deleted) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_deleted', { slug });
          const clients = sseClients.get(slug);
          if (clients) {
            for (const clientRes of clients) {
              try {
                clientRes.end();
              } catch {
                // ignore
              }
            }
            sseClients.delete(slug);
          }
          return sendJson(res, 200, { ok: true, deleted: true, slug });
        }

        if (subPath === '/events' && method === 'GET') {
          const exists = await store.getMatchRaw(slug);
          if (!exists) return sendJson(res, 404, { error: notFoundError });

          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
          });

          if (process.env.VERCEL) {
            res.write(`event: connected\ndata: ${JSON.stringify({ slug, mode: 'serverless' })}\n\n`);
            res.end();
            return;
          }

          res.write(`event: connected\ndata: ${JSON.stringify({ slug })}\n\n`);

          if (!sseClients.has(slug)) sseClients.set(slug, new Set());
          sseClients.get(slug).add(res);

          const heartbeat = setInterval(() => {
            try {
              res.write(': ping\n\n');
            } catch {
              clearInterval(heartbeat);
            }
          }, 25000);

          req.on('close', () => {
            clearInterval(heartbeat);
            sseClients.get(slug)?.delete(res);
          });
          return;
        }

        if (subPath === '/auth' && method === 'POST') {
          const body = await readBody(req);
          const raw = await store.getMatchRaw(slug);
          if (!raw) return sendJson(res, 404, { error: notFoundError });
          const limiterKey = `${slug}|${req.socket?.remoteAddress || ''}`;
          if (isAuthLocked(limiterKey)) {
            return sendJson(res, 429, { error: 'Muitas tentativas de PIN. Aguarde alguns minutos e tente de novo.' });
          }
          const ok = store.isAuthorized(raw, {
            adminPin: body.pin || '',
            adminToken: body.token || ''
          });
          if (!ok) {
            registerAuthFailure(limiterKey);
            return sendJson(res, 401, { error: 'PIN incorreto. Tente novamente.' });
          }
          authFailures.delete(limiterKey);
          return sendJson(res, 200, {
            match: await store.getMatchForClient(slug, { adminToken: raw.adminToken }),
            adminToken: raw.adminToken
          });
        }

        if (subPath === '/whatsapp-export' && method === 'GET') {
          const auth = getAuthFromReq(req);
          const match = await store.getMatchForClient(slug, auth);
          if (!match) return sendJson(res, 404, { error: notFoundError });
          return sendJson(res, 200, { text: formatTeamsForWhatsApp(match) });
        }

        if (subPath === '/import' && method === 'POST') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const body = await readBody(req);
          const updated = await store.importRawList(slug, body.rawList || '', {
            autoDraw: body.autoDraw !== false
          });
          if (!updated) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_updated', { updatedAt: updated.updatedAt, reason: 'import' });
          return sendJson(res, 200, { match: updated });
        }

        if (subPath === '/settings' && method === 'PATCH') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const body = await readBody(req);
          const updated = await store.updateSettings(slug, body);
          if (!updated) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_updated', { updatedAt: updated.updatedAt, reason: 'settings' });
          return sendJson(res, 200, { match: updated });
        }

        if (subPath === '/draw' && method === 'POST') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const body = await readBody(req);
          const updated = await store.executeDrawAction(slug, body.action || 'run_full_draw');
          if (!updated) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_updated', { updatedAt: updated.updatedAt, reason: 'draw' });
          return sendJson(res, 200, { match: updated });
        }

        if (subPath === '/players' && method === 'POST') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const body = await readBody(req);
          const updated = await store.addPlayer(slug, body);
          if (!updated) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_updated', { updatedAt: updated.updatedAt, reason: 'player_added' });
          return sendJson(res, 200, { match: updated });
        }

        const revealMatch = subPath.match(/^\/players\/([^/]+)\/reveal$/);
        if (revealMatch && method === 'POST') {
          const playerId = decodeURIComponent(revealMatch[1]);
          const result = await store.revealPlayerTeam(slug, playerId);
          if (!result) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'player_revealed', {
            playerId: result.player.id,
            playerName: result.player.name,
            teamId: result.team.id,
            updatedAt: result.match.updatedAt
          });
          return sendJson(res, 200, result);
        }

        const playerPatchMatch = subPath.match(/^\/players\/([^/]+)$/);
        if (playerPatchMatch && method === 'PATCH') {
          const raw = await requireAdmin(slug, req, res);
          if (!raw) return;
          const playerId = decodeURIComponent(playerPatchMatch[1]);
          const body = await readBody(req);
          const updated = await store.updatePlayer(slug, playerId, body);
          if (!updated) return sendJson(res, 404, { error: notFoundError });
          broadcast(slug, 'match_updated', { updatedAt: updated.updatedAt, reason: 'player_updated' });
          return sendJson(res, 200, { match: updated });
        }

        return sendJson(res, 404, { error: 'Endpoint da pelada não encontrado.' });
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'Rota de API não encontrada.' });
      }

      // Static & SPA routes
      const served = serveStaticFile(pathname === '/' ? '/index.html' : pathname, res);
      if (!served) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Frontend ainda não compilado. Execute `npm run build` ou acesse via Vite dev server.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno inesperado.';
      const status = /não encontrad|inválid|obrigat|dúvida|nenhum jogador|pelo menos \d+ (?:caracteres|letras)|informe o nome/i.test(message) ? 400 : 500;
      sendJson(res, status, { error: message });
    }
  }

  const server = http.createServer(handleRequest);

  return { server, store, handleRequest };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server } = createAppServer();
  const isDev = process.argv.includes('--dev');
  let targetPort = PORT;

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      targetPort += 1;
      console.log(`Porta ocupada, tentando http://localhost:${targetPort} ...`);
      server.listen(targetPort, HOST);
    } else {
      console.error('Erro ao iniciar servidor:', err);
      process.exit(1);
    }
  });

  server.listen(targetPort, HOST, () => {
    const activePort = server.address()?.port || targetPort;
    console.log(`\nSorteioFC rodando em: http://localhost:${activePort}`);
    console.log('Cada organizador cria a própria pelada (nome + PIN) direto na tela inicial.');
    if (!isDev) {
      console.log(`Para acessar pelo celular no mesmo Wi-Fi, use o IP da sua máquina na porta ${activePort}.\n`);
    }
  });

  if (isDev) {
    const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
    const vite = fs.existsSync(viteBin)
      ? spawn(process.execPath, [viteBin, '--host', '0.0.0.0'], {
          cwd: __dirname,
          stdio: 'inherit',
          shell: false
        })
      : spawn(process.platform === 'win32' ? 'npx.cmd vite --host 0.0.0.0' : 'npx', process.platform === 'win32' ? [] : ['vite', '--host', '0.0.0.0'], {
          cwd: __dirname,
          stdio: 'inherit',
          shell: process.platform === 'win32'
        });
    vite.on('error', (err) => {
      console.error('Não foi possível iniciar o Vite. Rode `npm install` e tente de novo.', err.message);
    });
    const shutdown = () => {
      vite.kill();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
