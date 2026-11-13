import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createAppServer } from '../server.mjs';

test('HTTP API supports public anti-spoiler flow, admin import, PIN change token rotation, and reveal', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-http-'));
  const dbPath = path.join(tmpDir, 'http.db');
  const prevPin = process.env.ADMIN_PIN;
  const initialTestPin = '7391';
  process.env.ADMIN_PIN = initialTestPin;

  const { server } = createAppServer({ dbPath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Public fetch hides unrevealed teams and strips admin secrets
    const res1 = await fetch(`${baseUrl}/api/matches/pelada-principal`);
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
    const revRes = await fetch(`${baseUrl}/api/matches/pelada-principal/players/${mateus.id}/reveal`, {
      method: 'POST'
    });
    assert.equal(revRes.status, 200);
    const revData = await revRes.json();
    assert.ok(revData.team.id);
    assert.equal(revData.player.revealed, true);

    // 3. Unauthorized admin mutation & URL query credentials rejected
    const unauth = await fetch(`${baseUrl}/api/matches/pelada-principal/draw?pin=${initialTestPin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open_live_urn' })
    });
    assert.equal(unauth.status, 401);

    // 4. Auth via PIN works and switches to live urn
    const authRes = await fetch(`${baseUrl}/api/matches/pelada-principal/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: initialTestPin })
    });
    assert.equal(authRes.status, 200);
    const { adminToken } = await authRes.json();
    assert.ok(adminToken);

    const urnRes = await fetch(`${baseUrl}/api/matches/pelada-principal/draw`, {
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
      `${baseUrl}/api/matches/pelada-principal/players/${eduardo.id}/reveal`,
      { method: 'POST' }
    );
    assert.equal(eduardoDraw.status, 200);
    const eduardoData = await eduardoDraw.json();
    assert.ok(eduardoData.team.id);
    assert.equal(eduardoData.player.arrived, true);

    // 6. Admin can change PIN and rotates adminToken
    const changePinRes = await fetch(`${baseUrl}/api/matches/pelada-principal/settings`, {
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
    const oldTokenTry = await fetch(`${baseUrl}/api/matches/pelada-principal/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ outfieldPerTeam: 5 })
    });
    assert.equal(oldTokenTry.status, 401);

    const oldAuth = await fetch(`${baseUrl}/api/matches/pelada-principal/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: initialTestPin })
    });
    assert.equal(oldAuth.status, 401);

    // New PIN accepted
    const newAuth = await fetch(`${baseUrl}/api/matches/pelada-principal/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2026' })
    });
    assert.equal(newAuth.status, 200);
    const newAuthData = await newAuth.json();
    assert.ok(newAuthData.adminToken);

    // 7. Admin updates outfield capacity to 4 on the line
    const setLineCapRes = await fetch(`${baseUrl}/api/matches/pelada-principal/settings`, {
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

    // 8. Full draw with cap 4 puts exactly 4 outfielders per team
    const drawCap4Res = await fetch(`${baseUrl}/api/matches/pelada-principal/draw`, {
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
      assert.equal(outfields.length, 4, `Team ${team.name} must strictly have 4 outfielders`);
    }
  } finally {
    if (prevPin === undefined) delete process.env.ADMIN_PIN;
    else process.env.ADMIN_PIN = prevPin;
    await new Promise((resolve) => server.close(resolve));
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

    const sse = await fetch(`http://127.0.0.1:${port}/api/matches/pelada-principal/events`);
    assert.equal(sse.status, 200);
    const sseText = await sse.text();
    assert.ok(sseText.includes('"mode":"serverless"'));
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    await new Promise((resolve) => srv.close(resolve));
  }
});
