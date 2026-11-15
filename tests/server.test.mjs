import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createAppServer } from '../server.mjs';
import { DEFAULT_SAMPLE_LIST } from '../lib/parser.mjs';

test('HTTP API supports room creation (empty), public anti-spoiler flow, admin import, PIN change token rotation, and reveal', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-http-'));
  const dbPath = path.join(tmpDir, 'http.db');
  const initialTestPin = '7391';

  const { server, store } = createAppServer({ dbPath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 0. No sample data: nothing is listed publicly and a fresh room starts empty
    const listRes = await fetch(`${baseUrl}/api/matches`);
    assert.deepEqual((await listRes.json()).matches, []);

    const badCreate = await fetch(`${baseUrl}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: 'Pelada', adminPin: '12' })
    });
    assert.equal(badCreate.status, 400);

    const createRes = await fetch(`${baseUrl}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: 'Pelada de Sexta', adminPin: initialTestPin })
    });
    assert.equal(createRes.status, 201);
    const { match: created } = await createRes.json();
    const slug = created.slug;
    assert.match(slug, /^pelada-de-sexta-[a-z0-9]{4,5}$/);
    assert.equal(created.players.length, 0, 'New room must start without players');
    assert.equal(created.meta.dateLabel, '');
    assert.equal(created.isAdmin, true);

    // Organizer imports the real list
    const importRes = await fetch(`${baseUrl}/api/matches/${slug}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': created.adminToken },
      body: JSON.stringify({ rawList: DEFAULT_SAMPLE_LIST })
    });
    assert.equal(importRes.status, 200);

    const mine = await fetch(`${baseUrl}/api/matches?slugs=${slug},nao-existe`);
    assert.equal((await mine.json()).matches.length, 1);
    // 1. Public fetch hides unrevealed teams and strips admin secrets
    const res1 = await fetch(`${baseUrl}/api/matches/${slug}`);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res1.headers.get('x-content-type-options'), 'nosniff');
    const { match: pub } = await res1.json();
    assert.equal(pub.groupName, 'Pelada de Sexta');
    assert.equal(pub.isAdmin, false);
    assert.equal(pub.adminPin, undefined);
    assert.equal(pub.adminToken, undefined);
    assert.equal(pub.players.length, 20);
    assert.ok(pub.players.every((p) => p.teamId === null));

    // Unauthenticated network-info does not leak LAN IPs
    const netPub = await fetch(`${baseUrl}/api/network-info`);
    const netPubJson = await netPub.json();
    assert.deepEqual(netPubJson.lanUrls, []);

    // 2. Player reveals their team
    const mateus = pub.players.find((p) => p.name === 'Mateus');
    const revRes = await fetch(`${baseUrl}/api/matches/${slug}/players/${mateus.id}/reveal`, {
      method: 'POST'
    });
    assert.equal(revRes.status, 200);
    const revData = await revRes.json();
    assert.ok(revData.team.id);
    assert.equal(revData.player.revealed, true);

    // 3. Unauthorized admin mutation & URL query credentials rejected
    const unauth = await fetch(`${baseUrl}/api/matches/${slug}/draw?pin=${initialTestPin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open_live_urn' })
    });
    assert.equal(unauth.status, 401);

    // 4. Auth via PIN works and switches to live urn
    const authRes = await fetch(`${baseUrl}/api/matches/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: initialTestPin })
    });
    assert.equal(authRes.status, 200);
    const { adminToken } = await authRes.json();
    assert.ok(adminToken);

    const urnRes = await fetch(`${baseUrl}/api/matches/${slug}/draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ action: 'open_live_urn' })
    });
    assert.equal(urnRes.status, 200);
    const { match: urnMatch } = await urnRes.json();
    assert.equal(urnMatch.drawMode, 'live_urn');
    assert.equal(urnMatch.drawStatus, 'live');
    assert.ok(urnMatch.players.every((p) => p.teamId === null));

    // 5. Player draws live from urn
    const eduardo = urnMatch.players.find((p) => p.name === 'Eduardo');
    const eduardoDraw = await fetch(
      `${baseUrl}/api/matches/${slug}/players/${eduardo.id}/reveal`,
      { method: 'POST' }
    );
    assert.equal(eduardoDraw.status, 200);
    const eduardoData = await eduardoDraw.json();
    assert.ok(eduardoData.team.id);
    assert.equal(eduardoData.player.arrived, true);

    // 6. Admin can change PIN and rotates adminToken
    const changePinRes = await fetch(`${baseUrl}/api/matches/${slug}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ adminPin: '2026' })
    });
    assert.equal(changePinRes.status, 200);
    const { match: updatedWithNewPin } = await changePinRes.json();
    assert.equal(updatedWithNewPin.adminPin, '2026');
    assert.notEqual(updatedWithNewPin.adminToken, adminToken, 'Changing PIN must rotate adminToken');

    // Old token & old PIN rejected
    const oldTokenTry = await fetch(`${baseUrl}/api/matches/${slug}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ outfieldPerTeam: 5 })
    });
    assert.equal(oldTokenTry.status, 401);

    const oldAuth = await fetch(`${baseUrl}/api/matches/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: initialTestPin })
    });
    assert.equal(oldAuth.status, 401);

    // New PIN accepted
    const newAuth = await fetch(`${baseUrl}/api/matches/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2026' })
    });
    assert.equal(newAuth.status, 200);
    const newAuthData = await newAuth.json();
    assert.ok(newAuthData.adminToken);

    // 7. Admin updates outfield capacity to 4 on the line
    const setLineCapRes = await fetch(`${baseUrl}/api/matches/${slug}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': newAuthData.adminToken
      },
      body: JSON.stringify({ outfieldPerTeam: 4 })
    });
    assert.equal(setLineCapRes.status, 200);
    const { match: matchWithCap4 } = await setLineCapRes.json();
    assert.ok(matchWithCap4.teams.every((t) => t.outfieldCap === 4), 'All teams must have outfieldCap = 4');

    // 8. Full draw distributes all confirmed players across the teams and reveals them
    const drawCap4Res = await fetch(`${baseUrl}/api/matches/${slug}/draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': newAuthData.adminToken
      },
      body: JSON.stringify({ action: 'draw_and_reveal' })
    });
    assert.equal(drawCap4Res.status, 200);
    const { match: drawnCap4 } = await drawCap4Res.json();
    for (const team of drawnCap4.teams) {
      const roster = drawnCap4.players.filter((p) => p.teamId === team.id);
      const outfields = roster.filter((p) => p.role !== 'gk');
      assert.ok(outfields.length >= 5 && outfields.length <= 6, `Team ${team.name} must receive balanced outfielders`);
    }
    assert.ok(
      drawnCap4.players.filter((p) => p.status === 'confirmed').every((p) => p.teamId !== null && p.revealed === true),
      'All confirmed players must be assigned to a team and revealed'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Vercel serverless handler (api/index.mjs) and VERCEL=1 mode work cleanly', async () => {
  const prevVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  const http = await import('node:http');
  const { resolveDefaultDbPath } = await import('../lib/db.mjs');
  const { default: vercelHandler } = await import('../api/index.mjs');

  assert.equal(resolveDefaultDbPath(), path.join(os.tmpdir(), 'tiratime.db'));

  const srv = http.createServer((req, res) => vercelHandler(req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);

    const net = await fetch(`http://127.0.0.1:${port}/api/network-info`);
    const netJson = await net.json();
    assert.deepEqual(netJson.lanUrls, []);

    const createRes = await fetch(`http://127.0.0.1:${port}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: 'Racha Vercel', adminPin: '4321' })
    });
    const { match: created } = await createRes.json();
    const slug = created.slug;

    const sse = await fetch(`http://127.0.0.1:${port}/api/matches/${slug}/events`);
    assert.equal(sse.status, 200);
    const sseText = await sse.text();
    assert.ok(sseText.includes('"mode":"serverless"'));
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    await new Promise((resolve) => srv.close(resolve));
  }
});

async function createSqlitePgMock(legacySetupSql = '') {
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (legacySetupSql) sqlite.exec(legacySetupSql);

  const runSql = (sqlText, params = []) => {
    const trimmed = sqlText.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) {
      sqlite.exec(trimmed);
      return { rows: [], rowCount: 0 };
    }
    if (params.length === 0 && trimmed.includes(';')) {
      sqlite.exec(trimmed.replace(/DOUBLE PRECISION/gi, 'REAL'));
      return { rows: [], rowCount: 0 };
    }

    const flatParams = [];
    let normalized = trimmed.replace(/\bFOR UPDATE\b/gi, '').replace(/::(int|text)/gi, '');
    normalized = normalized.replace(/ANY\(\$(\d+)(\[\])?\)/gi, (_m, idxStr) => {
      const arr = params[Number(idxStr) - 1] || [];
      return `(${arr.map((val) => {
        flatParams.push(val);
        return '?';
      }).join(', ')})`;
    });
    if (!trimmed.includes('ANY(')) {
      normalized = normalized.replace(/\$(\d+)/g, (_m, idxStr) => {
        flatParams.push(params[Number(idxStr) - 1]);
        return '?';
      });
    }

    if (/^\s*SELECT\b/i.test(normalized)) {
      const rows = sqlite.prepare(normalized).all(...flatParams);
      return { rows, rowCount: rows.length };
    }
    const info = sqlite.prepare(normalized).run(...flatParams);
    return { rows: [], rowCount: info.changes };
  };

  return {
    sqlite,
    pool: {
      async query(sql, params) {
        return runSql(sql, params);
      },
      async connect() {
        return {
          async query(sql, params) {
            return runSql(sql, params);
          },
          release() {}
        };
      },
      async end() {
        sqlite.close();
      }
    }
  };
}

test('PostgresStore persists rooms, players, auth, settings, reset_week and DELETE /api/matches/:slug via SQL pool', async () => {
  const { PostgresStore, buildPoolConfig } = await import('../lib/pg-store.mjs');

  const neonCfg = buildPoolConfig('postgresql://user:pass@ep-cool-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require');
  assert.match(neonCfg.connectionString, /sslmode=verify-full/);

  const localCfg = buildPoolConfig('postgres://postgres:postgres@localhost:5432/tiratime?sslmode=disable');
  assert.equal(localCfg.ssl, false);

  const otherCfg = buildPoolConfig('postgresql://user:pass@db.example.com:5432/tiratime?sslmode=require');
  assert.deepEqual(otherCfg.ssl, { rejectUnauthorized: false });

  const { pool: mockPool } = await createSqlitePgMock();

  const pgStore = new PostgresStore(mockPool);
  const { server } = createAppServer({ store: pgStore });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createRes = await fetch(`${baseUrl}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: 'Los Canoas', adminPin: '1234' })
    });
    assert.equal(createRes.status, 201);
    const { match: created } = await createRes.json();
    const slug = created.slug;
    assert.match(slug, /^los-canoas-[a-z0-9]{4,5}$/);

    const listRes = await fetch(`${baseUrl}/api/matches?slugs=${encodeURIComponent(slug)}`);
    const listed = await listRes.json();
    assert.equal(listed.matches.length, 1);
    assert.equal(listed.matches[0].groupName, 'Los Canoas');

    const authRes = await fetch(`${baseUrl}/api/matches/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' })
    });
    assert.equal(authRes.status, 200);
    const authJson = await authRes.json();
    assert.equal(authJson.match.groupName, 'Los Canoas');

    const importRes = await fetch(`${baseUrl}/api/matches/${slug}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': authJson.adminToken },
      body: JSON.stringify({ rawList: DEFAULT_SAMPLE_LIST })
    });
    assert.equal(importRes.status, 200);
    const { match: imported } = await importRes.json();
    assert.equal(imported.players.length, 20);

    const patchRes = await fetch(`${baseUrl}/api/matches/${slug}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': authJson.adminToken },
      body: JSON.stringify({
        groupName: 'Los Canoas FC',
        feeAmount: 15,
        adminPin: '4321',
        lockOnePerDevice: true
      })
    });
    assert.equal(patchRes.status, 200);
    const { match: updated } = await patchRes.json();
    assert.equal(updated.groupName, 'Los Canoas FC');
    assert.equal(updated.meta.feeAmount, 15);
    assert.equal(updated.lockOnePerDevice, true);

    const newAuth = await fetch(`${baseUrl}/api/matches/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4321' })
    });
    assert.equal(newAuth.status, 200);
    const newAuthJson = await newAuth.json();

    const firstPlayer = updated.players.find((p) => p.status === 'confirmed');
    const revealRes = await fetch(`${baseUrl}/api/matches/${slug}/players/${firstPlayer.id}/reveal`, {
      method: 'POST'
    });
    assert.equal(revealRes.status, 200);
    const revealed = await revealRes.json();
    assert.equal(revealed.player.revealed, true);
    assert.ok(revealed.team.id);

    const addRes = await fetch(`${baseUrl}/api/matches/${slug}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': newAuthJson.adminToken },
      body: JSON.stringify({ name: 'Nivaldo', role: 'outfield', paid: true })
    });
    assert.equal(addRes.status, 200);
    const addedMatch = (await addRes.json()).match;
    const nivaldo = addedMatch.players.find((p) => p.name === 'Nivaldo');
    assert.equal(nivaldo.paid, true);

    const updPlayerRes = await fetch(`${baseUrl}/api/matches/${slug}/players/${nivaldo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': newAuthJson.adminToken },
      body: JSON.stringify({ paid: false })
    });
    assert.equal(updPlayerRes.status, 200);
    const updatedPlayerMatch = (await updPlayerRes.json()).match;
    assert.equal(updatedPlayerMatch.players.find((p) => p.id === nivaldo.id).paid, false);

    // Reset week clears players, open slots, and team assignments
    const resetRes = await fetch(`${baseUrl}/api/matches/${slug}/draw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': newAuthJson.adminToken },
      body: JSON.stringify({ action: 'reset_week' })
    });
    assert.equal(resetRes.status, 200);
    const resetMatch = (await resetRes.json()).match;
    assert.equal(resetMatch.players.length, 0);
    assert.equal(resetMatch.openSlots.length, 0);
    assert.equal(resetMatch.drawStatus, 'draft');

    // DELETE requires valid admin auth
    const unauthDel = await fetch(`${baseUrl}/api/matches/${slug}`, { method: 'DELETE' });
    assert.equal(unauthDel.status, 401);

    const delRes = await fetch(`${baseUrl}/api/matches/${slug}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': newAuthJson.adminToken }
    });
    assert.equal(delRes.status, 200);
    assert.equal((await delRes.json()).deleted, true);

    const afterDelGet = await fetch(`${baseUrl}/api/matches/${slug}`);
    assert.equal(afterDelGet.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pgStore.close();
  }
});

test('PostgresStore safely runs incremental column migrations on legacy tables', async () => {
  const { PostgresStore } = await import('../lib/pg-store.mjs');
  const { pool } = await createSqlitePgMock(`
    CREATE TABLE matches (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      group_name TEXT NOT NULL,
      title TEXT NOT NULL,
      date_label TEXT NOT NULL,
      time_label TEXT NOT NULL,
      teams_json TEXT NOT NULL,
      admin_pin TEXT NOT NULL,
      admin_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
  `);

  const pgStore = new PostgresStore(pool);
  try {
    const created = await pgStore.createMatch({ groupName: 'Pelada Migrada', adminPin: '1234' });
    assert.equal(created.lockOnePerDevice, false);
    const toggled = await pgStore.updateSettings(created.slug, { lockOnePerDevice: true });
    assert.equal(toggled.lockOnePerDevice, true);
  } finally {
    await pgStore.close();
  }
});
