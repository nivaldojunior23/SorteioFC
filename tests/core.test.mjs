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
import { DatabaseSync } from 'node:sqlite';
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

test('PeladaStore starts empty, creates rooms with PIN, draws from urn, and masks closed_reveal spoilers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  let store;

  try {
    store = new PeladaStore(dbPath);
    assert.equal(store.listMatchesBySlugs(['pelada-principal']).length, 0, 'No sample match must be seeded');
    assert.throws(() => store.createMatch({ groupName: 'X', adminPin: '1234' }), /nome da pelada/);
    assert.throws(() => store.createMatch({ groupName: 'Pelada de Sexta', adminPin: '12' }), /PIN/);

    const initialPin = '8642';
    const empty = store.createMatch({ groupName: 'Pelada de Sexta', adminPin: initialPin, timeLabel: '21:00', feeAmount: '15' });
    assert.equal(empty.players.length, 0);
    assert.equal(empty.meta.timeLabel, '21:00');
    assert.equal(empty.meta.feeAmount, 15);
    const slug = empty.slug;

    store.importRawList(slug, DEFAULT_SAMPLE_LIST);
    const publicBefore = store.getMatchForClient(slug);
    assert.equal(publicBefore.isAdmin, false);
    assert.equal(publicBefore.adminPin, undefined);
    assert.equal(publicBefore.adminToken, undefined);
    assert.equal(publicBefore.drawMode, 'live_urn');
    assert.ok(
      publicBefore.players.every((p) => p.teamId === null),
      'Unrevealed teamId must be null before urn draw'
    );

    const lucas = publicBefore.players.find((p) => p.name === 'Lucas');
    const reveal = store.revealPlayerTeam(slug, lucas.id);
    assert.ok(reveal.team);
    assert.equal(reveal.player.revealed, true);
    assert.equal(reveal.player.teamId, reveal.team.id);

    const publicAfter = store.getMatchForClient(slug);
    const lucasAfter = publicAfter.players.find((p) => p.id === lucas.id);
    assert.equal(lucasAfter.teamId, reveal.team.id);

    // Switch to closed_reveal and verify Admin sees pre-drawn teams while Public is masked
    store.updateSettings(slug, { drawMode: 'closed_reveal' });
    const publicClosed = store.getMatchForClient(slug);
    assert.ok(
      publicClosed.players.every((p) => p.teamId === null),
      'Unrevealed teamId must be masked in closed_reveal'
    );

    const adminView = store.getMatchForClient(slug, { adminPin: initialPin });
    assert.equal(adminView.isAdmin, true);
    assert.ok(
      adminView.players.some((p) => p.teamId !== null),
      'Admin should see pre-drawn teams in closed_reveal'
    );

    const whatsappText = formatTeamsForWhatsApp(publicAfter);
    assert.match(whatsappText, /PELADA DE SEXTA/);
    assert.match(whatsappText, /Lucas/);
  } finally {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parser does not invent date/time/fee when the list does not have them', () => {
  const parsed = parseWhatsAppList('1- Ana\n2- Bia');
  assert.equal(parsed.players.length, 2);
  assert.equal(parsed.meta.dateLabel, '');
  assert.equal(parsed.meta.timeLabel, '');
  assert.equal(parsed.meta.feeAmount, 0);
});

test('room metadata can be updated and is preserved when importing a plain list without headers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-meta-'));
  const dbPath = path.join(tmpDir, 'meta.db');
  let store;

  try {
    store = new PeladaStore(dbPath);
    const created = store.createMatch({
      groupName: 'Racha da Firma',
      adminPin: '9988',
      dateLabel: 'Quinta',
      timeLabel: '20:30',
      feeAmount: 20
    });
    assert.equal(created.meta.feeLabel, 'R$ 20');

    const updated = store.updateSettings(created.slug, {
      groupName: 'Racha dos Amigos',
      dateLabel: 'Terça',
      timeLabel: '21:00',
      feeAmount: 0
    });
    assert.equal(updated.groupName, 'Racha dos Amigos');
    assert.equal(updated.meta.dateLabel, 'Terça');
    assert.equal(updated.meta.timeLabel, '21:00');
    assert.equal(updated.meta.feeAmount, 0);
    assert.equal(updated.meta.feeLabel, '');

    assert.throws(() => store.updateSettings(created.slug, { groupName: 'A' }), /pelo menos 2 letras/);

    const imported = store.importRawList(created.slug, '1- João\n2- Pedro\nGoleiros:\n3- Lucas');
    assert.equal(imported.players.length, 3);
    assert.equal(imported.meta.dateLabel, 'Terça');
    assert.equal(imported.meta.timeLabel, '21:00');
    assert.equal(imported.meta.feeAmount, 0);
  } finally {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('full draw distributes all confirmed players evenly without leaving anyone as substitute', () => {
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
    assert.ok(outfields.length >= 5 && outfields.length <= 6, `Team ${team.name} must receive balanced outfielders`);
  }

  const unassigned = drawRes.players.filter(
    (p) => p.status === 'confirmed' && p.teamId === null
  );
  assert.equal(unassigned.length, 0, 'No confirmed player should be left unassigned as substitute');
});

test('draw_and_reveal (Preencher Vagas Automaticamente) assigns and reveals teams immediately for public players', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-autofill-'));
  const dbPath = path.join(tmpDir, 'autofill.db');
  let store;

  try {
    store = new PeladaStore(dbPath);
    const created = store.createMatch({
      groupName: 'Pelada AutoFill',
      adminPin: '1234'
    });
    store.importRawList(created.slug, DEFAULT_SAMPLE_LIST);
    store.executeDrawAction(created.slug, 'draw_and_reveal');

    const publicView = store.getMatchForClient(created.slug);
    assert.equal(publicView.revealAllPublic, true);
    assert.equal(publicView.drawStatus, 'drawn');
    assert.equal(publicView.teams.length, 3, 'First import should auto-size to suggestedTeams (3)');

    const assignedPublic = publicView.players.filter((p) => p.teamId !== null);
    assert.equal(assignedPublic.length, 19);
    assert.ok(
      assignedPublic.every((p) => p.revealed === true),
      'All automatically filled players must already be revealed without needing to draw from urn'
    );
  } finally {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('reset_week clears players, open slots, team assignments and public reveal while preserving settings and PIN', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-reset-week-'));
  const dbPath = path.join(tmpDir, 'reset-week.db');
  let store;

  try {
    store = new PeladaStore(dbPath);
    const created = store.createMatch({
      groupName: 'Pelada Quinta',
      adminPin: '2026'
    });
    store.importRawList(created.slug, DEFAULT_SAMPLE_LIST);
    let updated = store.updateSettings(created.slug, { lockOnePerDevice: true });
    assert.equal(updated.lockOnePerDevice, true);

    updated = store.executeDrawAction(created.slug, 'draw_and_reveal');
    const firstPlayer = updated.players[0];
    store.updatePlayer(created.slug, firstPlayer.id, { paid: true, arrived: true });

    const reset = store.executeDrawAction(created.slug, 'reset_week');
    assert.equal(reset.revealAllPublic, false);
    assert.equal(reset.lockOnePerDevice, true);
    assert.equal(reset.players.length, 0);
    assert.equal(reset.openSlots.length, 0);
    assert.equal(reset.drawStatus, 'draft');
    assert.ok(reset.teams.every((t) => t.assignedPlayers.length === 0));

    // Re-importing a new list after reset_week works cleanly with empty paid/arrived
    const reimported = store.importRawList(created.slug, DEFAULT_SAMPLE_LIST);
    assert.ok(reimported.players.length > 0);
    assert.ok(reimported.players.every((p) => p.paid === false));
  } finally {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SQLite PeladaStore migrates legacy tables missing newer columns via ALTER TABLE', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiratime-sqlite-migrate-'));
  const dbPath = path.join(tmpDir, 'legacy.db');
  const legacyDb = new DatabaseSync(dbPath);
  let store;

  try {
    // Legacy schema intentionally missing balance_gk, lock_one_per_device, arrival_note, revealed_at, arrived, etc.
    legacyDb.exec(`
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
    legacyDb.close();

    store = new PeladaStore(dbPath);
    const created = store.createMatch({ groupName: 'Racha Legado', adminPin: '1234' });
    assert.equal(created.lockOnePerDevice, false);
    assert.equal(created.balanceGk, true);

    const toggled = store.updateSettings(created.slug, { lockOnePerDevice: true });
    assert.equal(toggled.lockOnePerDevice, true);

    const deleted = store.deleteMatch(created.slug);
    assert.equal(deleted, true);
    assert.equal(store.getMatchForClient(created.slug), null);
  } finally {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
