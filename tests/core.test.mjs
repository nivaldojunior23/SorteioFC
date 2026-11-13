import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DEFAULT_SAMPLE_LIST, parseWhatsAppList } from '../lib/parser.mjs';
import {
  assignSinglePlayerFromUrn,
  buildDefaultTeams,
  formatTeamsForWhatsApp,
  prepareLiveUrn,
  runFullDraw
} from '../lib/draw.mjs';
import { PeladaStore } from '../lib/db.mjs';

test('parses WhatsApp pelada list with formatting quirks cleanly', () => {
  const parsed = parseWhatsAppList(DEFAULT_SAMPLE_LIST);

  assert.equal(parsed.meta.dateLabel, 'SEXTA FEIRA');
  assert.equal(parsed.meta.timeLabel, '22:00');
  assert.equal(parsed.meta.arrivalNote, 'cheguem 10 minutos antes');
  assert.equal(parsed.meta.feeAmount, 10);

  // 17 outfielders (slot 11 empty, two 14s) + 3 GKs = 20 total
  assert.equal(parsed.players.length, 20);
  assert.equal(parsed.summary.outfieldCount, 17);
  assert.equal(parsed.summary.gkCount, 3);
  assert.equal(parsed.summary.doubtCount, 1);
  assert.equal(parsed.openSlots.length, 1);
  assert.equal(parsed.openSlots[0].listNumber, 11);

  const tiago = parsed.players.find((p) => p.name === 'Tiago');
  assert.equal(tiago.isGuest, true);

  const felipe = parsed.players.find((p) => p.name === 'felipe');
  assert.equal(felipe.note, 'chega 10 min depois');

  const gustavo = parsed.players.find((p) => p.name === 'Gustavo');
  assert.equal(gustavo.status, 'doubt');
  assert.match(gustavo.note, /joelho/i);

  const bruno = parsed.players.find((p) => p.name === 'Bruno');
  const daniel = parsed.players.find((p) => p.name === 'Daniel');
  assert.equal(bruno.listNumber, 14);
  assert.equal(daniel.listNumber, 14);

  const henrique = parsed.players.find((p) => p.name === 'henrique');
  assert.equal(henrique.isGuest, true);
  assert.equal(henrique.note, 'Conv. Lucas');

  const renato = parsed.players.find((p) => p.name === 'Renato');
  assert.ok(renato, 'Trailing period on Renato. should be stripped');
  assert.equal(renato.role, 'gk');
});

test('parses single-line collapsed WhatsApp paste accurately', () => {
  const collapsed = DEFAULT_SAMPLE_LIST.replace(/\n+/g, ' ');
  const parsed = parseWhatsAppList(collapsed);
  assert.equal(parsed.players.length, 20);
  assert.equal(parsed.summary.gkCount, 3);
  assert.equal(parsed.openSlots[0].listNumber, 11);
});

test('balanced full draw separates goalkeepers and outfielders evenly', () => {
  const parsed = parseWhatsAppList(DEFAULT_SAMPLE_LIST);
  const teams = buildDefaultTeams(3);
  const res = runFullDraw({
    players: parsed.players,
    teams,
    includeDoubts: false,
    balanceGk: true,
    revealImmediately: false
  });

  // Gustavo (doubt) excluded -> 16 outfield + 3 GK = 19 drawn
  const drawn = res.players.filter((p) => p.teamId !== null);
  assert.equal(drawn.length, 19);
  assert.ok(drawn.every((p) => p.revealed === false));

  for (const team of res.teams) {
    const teamPlayers = drawn.filter((p) => p.teamId === team.id);
    const gks = teamPlayers.filter((p) => p.role === 'gk');
    assert.equal(gks.length, 1, `Team ${team.name} should have exactly 1 GK`);
    const outfields = teamPlayers.filter((p) => p.role === 'outfield');
    assert.ok(outfields.length >= 5 && outfields.length <= 6);
  }
});

test('live urn guarantees balanced teams as players arrive one by one', () => {
  const parsed = parseWhatsAppList(DEFAULT_SAMPLE_LIST);
  const teams = buildDefaultTeams(3);
  let state = prepareLiveUrn({
    players: parsed.players,
    teams,
    includeDoubts: false
  });

  const confirmed = state.players.filter((p) => p.status === 'confirmed');
  for (const player of confirmed) {
    const drawRes = assignSinglePlayerFromUrn({
      playerId: player.id,
      players: state.players,
      teams: state.teams,
      balanceGk: true
    });
    state = { ...state, players: drawRes.players };
  }

  for (const team of state.teams) {
    const teamPlayers = state.players.filter((p) => p.teamId === team.id);
    const gks = teamPlayers.filter((p) => p.role === 'gk');
    assert.equal(gks.length, 1);
    const outfields = teamPlayers.filter((p) => p.role === 'outfield');
    assert.ok(outfields.length >= 5 && outfields.length <= 6);
  }
});

test('PeladaStore defaults to live_urn mode, draws from urn, generates safe PIN, and masks closed_reveal spoilers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const prevPin = process.env.ADMIN_PIN;
  delete process.env.ADMIN_PIN;

  try {
    const store = new PeladaStore(dbPath);
    assert.ok(store.generatedInitialPin, 'Should generate a random initial PIN when ADMIN_PIN env is unset');
    assert.match(store.generatedInitialPin, /^\d{6}$/);

    const initialPin = store.generatedInitialPin;
    const publicBefore = store.getMatchForClient('pelada-principal');
    assert.equal(publicBefore.isAdmin, false);
    assert.equal(publicBefore.adminPin, undefined);
    assert.equal(publicBefore.adminToken, undefined);
    assert.equal(publicBefore.drawMode, 'live_urn');
    assert.ok(
      publicBefore.players.every((p) => p.teamId === null),
      'Unrevealed teamId must be null before urn draw'
    );

    const lucas = publicBefore.players.find((p) => p.name === 'Lucas');
    const reveal = store.revealPlayerTeam('pelada-principal', lucas.id);
    assert.ok(reveal.team);
    assert.equal(reveal.player.revealed, true);
    assert.equal(reveal.player.teamId, reveal.team.id);

    const publicAfter = store.getMatchForClient('pelada-principal');
    const lucasAfter = publicAfter.players.find((p) => p.id === lucas.id);
    assert.equal(lucasAfter.teamId, reveal.team.id);

    // Switch to closed_reveal and verify Admin sees pre-drawn teams while Public is masked
    store.updateSettings('pelada-principal', { drawMode: 'closed_reveal' });
    const publicClosed = store.getMatchForClient('pelada-principal');
    assert.ok(
      publicClosed.players.every((p) => p.teamId === null),
      'Unrevealed teamId must be masked in closed_reveal'
    );

    const adminView = store.getMatchForClient('pelada-principal', { adminPin: initialPin });
    assert.equal(adminView.isAdmin, true);
    assert.ok(
      adminView.players.some((p) => p.teamId !== null),
      'Admin should see pre-drawn teams in closed_reveal'
    );

    const whatsappText = formatTeamsForWhatsApp(publicAfter);
    assert.match(whatsappText, /PELADA DE SEXTA/);
    assert.match(whatsappText, /Lucas/);
  } finally {
    if (prevPin === undefined) delete process.env.ADMIN_PIN;
    else process.env.ADMIN_PIN = prevPin;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('outfield cap strictly limits field players per team and keeps excess as substitutes', () => {
  const parsed = parseWhatsAppList(DEFAULT_SAMPLE_LIST);
  const teamsWithCap4 = buildDefaultTeams(3, 4);
  assert.ok(teamsWithCap4.every((t) => t.outfieldCap === 4));

  const drawRes = runFullDraw({
    players: parsed.players,
    teams: teamsWithCap4,
    includeDoubts: false,
    balanceGk: true,
    revealImmediately: true
  });

  for (const team of drawRes.teams) {
    const roster = drawRes.players.filter((p) => p.teamId === team.id);
    const gks = roster.filter((p) => p.role === 'gk');
    const outfields = roster.filter((p) => p.role !== 'gk');

    assert.equal(gks.length, 1, `Team ${team.name} must have 1 goalkeeper`);
    assert.equal(outfields.length, 4, `Team ${team.name} must strictly have 4 outfield players`);
    assert.equal(roster.length, 5, `Team ${team.name} must have 1 GK + 4 Line = 5 players total`);
  }

  // 16 confirmed outfield players - (3 teams * 4 on line) = 4 excess outfielders on waiting list
  const unassigned = drawRes.players.filter(
    (p) => p.status === 'confirmed' && p.teamId === null
  );
  assert.equal(unassigned.length, 4, 'Should have 4 confirmed players as substitutes');

  const formatted = formatTeamsForWhatsApp({
    groupName: 'Pelada de Sexta',
    meta: parsed.meta,
    teams: drawRes.teams,
    players: drawRes.players,
    openSlots: parsed.openSlots,
    revealAllPublic: true
  });
  assert.match(formatted, /Próximos da Fila \/ Suplentes/);
});
