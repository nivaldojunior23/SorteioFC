import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWhatsAppList } from './parser.mjs';
import {
  DEFAULT_OUTFIELD_PER_TEAM,
  assignSinglePlayerFromUrn,
  buildDefaultTeams,
  normalizeTeams,
  prepareLiveUrn,
  runFullDraw
} from './draw.mjs';

export const MIN_PIN_LENGTH = 4;
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i to avoid confusion

function generateAdminToken() {
  return randomBytes(24).toString('hex');
}

function generateRoomCode(length = 4) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function parseFeeAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function cleanText(value, max = 60) {
  return String(value ?? '').trim().slice(0, max);
}

function safeSecretEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const trimmedProvided = provided.trim();
  const trimmedExpected = expected.trim();
  if (!trimmedProvided || !trimmedExpected) return false;
  const a = createHash('sha256').update(trimmedProvided, 'utf8').digest();
  const b = createHash('sha256').update(trimmedExpected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function resolveDefaultDbPath() {
  if (process.env.TIRATIME_DB_PATH) {
    return process.env.TIRATIME_DB_PATH;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return path.join(os.tmpdir(), 'tiratime.db');
  }
  return path.resolve(process.cwd(), 'data', 'tiratime.db');
}

export function slugify(text) {
  return String(text || 'pelada')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'pelada';
}

export class PeladaStore {
  constructor(dbPath = resolveDefaultDbPath()) {
    let targetPath = dbPath;
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      this.db = new DatabaseSync(targetPath);
    } catch {
      targetPath = path.join(os.tmpdir(), 'tiratime.db');
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      this.db = new DatabaseSync(targetPath);
    }
    this.generatedInitialPin = null;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  close() {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        group_name TEXT NOT NULL,
        title TEXT NOT NULL,
        date_label TEXT NOT NULL,
        time_label TEXT NOT NULL,
        arrival_note TEXT NOT NULL DEFAULT '',
        fee_label TEXT NOT NULL DEFAULT '',
        fee_amount REAL NOT NULL DEFAULT 10,
        raw_list TEXT NOT NULL DEFAULT '',
        draw_mode TEXT NOT NULL DEFAULT 'closed_reveal',
        draw_status TEXT NOT NULL DEFAULT 'drawn',
        reveal_all_public INTEGER NOT NULL DEFAULT 0,
        include_doubts INTEGER NOT NULL DEFAULT 0,
        balance_gk INTEGER NOT NULL DEFAULT 1,
        teams_json TEXT NOT NULL,
        open_slots_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        admin_pin TEXT NOT NULL,
        admin_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        list_number INTEGER,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'outfield',
        status TEXT NOT NULL DEFAULT 'confirmed',
        is_guest INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        paid INTEGER NOT NULL DEFAULT 0,
        arrived INTEGER NOT NULL DEFAULT 0,
        team_id TEXT,
        revealed INTEGER NOT NULL DEFAULT 0,
        revealed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_players_match ON players(match_id, sort_order);
    `);
  }

  insertPlayers(matchId, players) {
    const stmt = this.db.prepare(
      `INSERT INTO players (
        id, match_id, list_number, name, role, status, is_guest, note,
        paid, arrived, team_id, revealed, revealed_at, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    players.forEach((p, idx) => {
      stmt.run(
        p.id || randomUUID(),
        matchId,
        p.listNumber ?? null,
        p.name,
        p.role || 'outfield',
        p.status || 'confirmed',
        p.isGuest ? 1 : 0,
        p.note || '',
        p.paid ? 1 : 0,
        p.arrived ? 1 : 0,
        p.teamId ?? null,
        p.revealed ? 1 : 0,
        p.revealedAt ?? null,
        p.sortOrder ?? idx + 1
      );
    });
  }

  listMatches() {
    return this.db
      .prepare(
        `SELECT slug, group_name as groupName, title, date_label as dateLabel,
                time_label as timeLabel, draw_mode as drawMode, draw_status as drawStatus,
                updated_at as updatedAt
         FROM matches ORDER BY created_at DESC`
      )
      .all();
  }

  getMatchRaw(slug) {
    const row = this.db.prepare('SELECT * FROM matches WHERE slug = ?').get(slug);
    if (!row) return null;

    const playerRows = this.db
      .prepare('SELECT * FROM players WHERE match_id = ? ORDER BY sort_order ASC, rowid ASC')
      .all(row.id);

    return {
      id: row.id,
      slug: row.slug,
      groupName: row.group_name,
      meta: {
        title: row.title,
        dateLabel: row.date_label,
        timeLabel: row.time_label,
        arrivalNote: row.arrival_note,
        feeLabel: row.fee_label,
        feeAmount: Number(row.fee_amount)
      },
      rawList: row.raw_list,
      drawMode: row.draw_mode,
      drawStatus: row.draw_status,
      revealAllPublic: Boolean(row.reveal_all_public),
      includeDoubts: Boolean(row.include_doubts),
      balanceGk: Boolean(row.balance_gk),
      teams: normalizeTeams(JSON.parse(row.teams_json)),
      openSlots: JSON.parse(row.open_slots_json),
      warnings: JSON.parse(row.warnings_json),
      adminPin: row.admin_pin,
      adminToken: row.admin_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      players: playerRows.map((p) => ({
        id: p.id,
        listNumber: p.list_number,
        name: p.name,
        role: p.role,
        status: p.status,
        isGuest: Boolean(p.is_guest),
        note: p.note,
        paid: Boolean(p.paid),
        arrived: Boolean(p.arrived),
        teamId: p.team_id,
        revealed: Boolean(p.revealed),
        revealedAt: p.revealed_at,
        sortOrder: p.sort_order
      }))
    };
  }

  isAuthorized(match, auth = {}) {
    if (!match || !auth || typeof auth !== 'object') return false;
    if (safeSecretEqual(auth.adminToken, match.adminToken)) return true;
    if (safeSecretEqual(auth.adminPin, match.adminPin)) return true;
    return false;
  }

  getMatchForClient(slug, auth = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const isAdmin = this.isAuthorized(match, auth);
    const hideUnrevealed = !isAdmin && !match.revealAllPublic;

    const sanitizedPlayers = match.players.map((p) => ({
      ...p,
      // Mask teamId for unrevealed players when spoiler protection is enabled
      teamId: hideUnrevealed && !p.revealed ? null : p.teamId
    }));

    const { adminPin: _pin, adminToken: _token, ...publicBase } = match;
    return {
      ...publicBase,
      isAdmin,
      ...(isAdmin ? { adminPin: match.adminPin, adminToken: match.adminToken } : {}),
      players: sanitizedPlayers
    };
  }

  /**
   * Creates a new "room" (pelada) owned by whoever knows the PIN.
   * Starts EMPTY unless the organizer provides a list — no sample/fake players.
   */
  createMatch({
    groupName,
    adminPin,
    rawList = '',
    teamCount,
    drawMode = 'live_urn',
    dateLabel = '',
    timeLabel = '',
    feeAmount
  } = {}) {
    const cleanGroup = cleanText(groupName, 60);
    if (cleanGroup.length < 2) {
      throw new Error('O nome da pelada é obrigatório (mínimo 2 letras).');
    }
    const rawPin = adminPin !== undefined && adminPin !== null ? String(adminPin).trim() : '';
    if (rawPin.length < MIN_PIN_LENGTH) {
      throw new Error(`O PIN do organizador precisa ter pelo menos ${MIN_PIN_LENGTH} caracteres.`);
    }

    const text = rawList && String(rawList).trim() ? String(rawList) : '';
    const parsed = text ? parseWhatsAppList(text) : null;
    const players = parsed ? parsed.players : [];

    const fee = parsed && parsed.meta.feeAmount ? parsed.meta.feeAmount : parseFeeAmount(feeAmount);
    const meta = {
      title: parsed?.meta.title || '',
      dateLabel: parsed?.meta.dateLabel || cleanText(dateLabel, 40),
      timeLabel: parsed?.meta.timeLabel || cleanText(timeLabel, 20),
      arrivalNote: parsed?.meta.arrivalNote || '',
      feeLabel: parsed?.meta.feeLabel || (fee > 0 ? `R$ ${fee}` : ''),
      feeAmount: fee
    };

    const baseSlug = slugify(cleanGroup).slice(0, 32);
    let slug = `${baseSlug}-${generateRoomCode()}`;
    while (this.db.prepare('SELECT 1 FROM matches WHERE slug = ?').get(slug)) {
      slug = `${baseSlug}-${generateRoomCode(5)}`;
    }

    const resolvedTeamCount = Math.min(4, Math.max(2, Math.round(Number(teamCount) || (parsed ? parsed.summary.suggestedTeams : 2))));
    const teams = buildDefaultTeams(resolvedTeamCount);
    const mode = drawMode === 'closed_reveal' ? 'closed_reveal' : 'live_urn';
    const prepared =
      mode === 'live_urn'
        ? { ...prepareLiveUrn({ players, teams, includeDoubts: false }), drawStatus: 'live' }
        : {
            ...runFullDraw({
              players,
              teams,
              includeDoubts: false,
              balanceGk: true,
              revealImmediately: false
            }),
            drawStatus: 'drawn'
          };

    const matchId = randomUUID();
    const adminToken = generateAdminToken();
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO matches (
            id, slug, group_name, title, date_label, time_label, arrival_note,
            fee_label, fee_amount, raw_list, draw_mode, draw_status,
            reveal_all_public, include_doubts, balance_gk,
            teams_json, open_slots_json, warnings_json,
            admin_pin, admin_token, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          matchId,
          slug,
          cleanGroup,
          meta.title,
          meta.dateLabel,
          meta.timeLabel,
          meta.arrivalNote,
          meta.feeLabel,
          meta.feeAmount,
          text,
          mode,
          prepared.drawStatus,
          0,
          0,
          1,
          JSON.stringify(prepared.teams),
          JSON.stringify(parsed ? parsed.openSlots : []),
          JSON.stringify(parsed ? parsed.warnings : []),
          rawPin,
          adminToken,
          now,
          now
        );
      this.insertPlayers(matchId, prepared.players);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken });
  }

  /** Public summaries only for the slugs the browser already knows (no global listing). */
  listMatchesBySlugs(slugs = []) {
    const unique = [...new Set(slugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (unique.length === 0) return [];
    const placeholders = unique.map(() => '?').join(', ');
    return this.db
      .prepare(
        `SELECT slug, group_name as groupName, title, date_label as dateLabel,
                time_label as timeLabel, draw_mode as drawMode, draw_status as drawStatus,
                updated_at as updatedAt
         FROM matches WHERE slug IN (${placeholders}) ORDER BY updated_at DESC`
      )
      .all(...unique);
  }

  importRawList(slug, rawList, { autoDraw = true } = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const parsed = parseWhatsAppList(rawList);
    if (parsed.players.length === 0) {
      throw new Error('Nenhum jogador identificado na lista. Verifique os números (ex: 1- Nome).');
    }

    // Preserve payment flags if same normalized name existed before
    const previousByName = new Map(
      match.players.map((p) => [p.name.trim().toLowerCase(), p])
    );

    const mergedPlayers = parsed.players.map((p) => {
      const prev = previousByName.get(p.name.trim().toLowerCase());
      return prev ? { ...p, paid: prev.paid } : p;
    });

    const teams = match.teams.length >= 2 ? match.teams : buildDefaultTeams(parsed.summary.suggestedTeams);

    let result;
    let drawStatus;
    if (!autoDraw) {
      result = { teams, players: mergedPlayers };
      drawStatus = 'draft';
    } else if (match.drawMode === 'live_urn') {
      result = prepareLiveUrn({
        players: mergedPlayers,
        teams,
        includeDoubts: match.includeDoubts
      });
      drawStatus = 'live';
    } else {
      result = runFullDraw({
        players: mergedPlayers,
        teams,
        includeDoubts: match.includeDoubts,
        balanceGk: match.balanceGk,
        revealImmediately: false
      });
      drawStatus = 'drawn';
    }

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `UPDATE matches SET
             title = ?, date_label = ?, time_label = ?, arrival_note = ?,
             fee_label = ?, fee_amount = ?, raw_list = ?,
             draw_status = ?, reveal_all_public = 0,
             teams_json = ?, open_slots_json = ?, warnings_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          parsed.meta.title || match.meta.title,
          parsed.meta.dateLabel || match.meta.dateLabel,
          parsed.meta.timeLabel || match.meta.timeLabel,
          parsed.meta.arrivalNote || match.meta.arrivalNote,
          parsed.meta.feeLabel || match.meta.feeLabel,
          parsed.meta.feeLabel ? parsed.meta.feeAmount : match.meta.feeAmount,
          rawList,
          drawStatus,
          JSON.stringify(result.teams),
          JSON.stringify(parsed.openSlots),
          JSON.stringify(parsed.warnings),
          now,
          match.id
        );

      this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
      this.insertPlayers(match.id, result.players);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  updateSettings(slug, patch = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    let nextTeams = match.teams;
    let nextPlayers = match.players;
    let needsRedraw = false;

    const rawTeamCount = Number(patch.teamCount);
    if (
      Number.isFinite(rawTeamCount) &&
      rawTeamCount !== match.teams.length &&
      patch.teamCount !== undefined
    ) {
      const count = Math.min(4, Math.max(2, Math.round(rawTeamCount)));
      const currentOutfieldCap = Number(match.teams[0]?.outfieldCap) || DEFAULT_OUTFIELD_PER_TEAM;
      const defaults = buildDefaultTeams(count, currentOutfieldCap);
      nextTeams = defaults.map((def, i) =>
        match.teams[i] ? { ...match.teams[i], outfieldCap: currentOutfieldCap } : def
      );
      needsRedraw = true;
    }

    if (Array.isArray(patch.teams) && patch.teams.length >= 2 && patch.teams.length <= 4) {
      const prevCap = Number(nextTeams[0]?.outfieldCap) || DEFAULT_OUTFIELD_PER_TEAM;
      nextTeams = patch.teams.map((t, idx) => ({
        ...t,
        outfieldCap: Number(t.outfieldCap) || nextTeams[idx]?.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM
      }));
      if (Number(nextTeams[0]?.outfieldCap) !== prevCap) {
        needsRedraw = true;
      }
    }

    const rawOutfield = Number(patch.outfieldPerTeam ?? patch.outfieldCap);
    if (
      Number.isFinite(rawOutfield) &&
      (patch.outfieldPerTeam !== undefined || patch.outfieldCap !== undefined)
    ) {
      const lineCap = Math.min(11, Math.max(3, Math.round(rawOutfield)));
      nextTeams = nextTeams.map((t) => ({ ...t, outfieldCap: lineCap }));
      needsRedraw = true;
    }

    const nextDrawMode = patch.drawMode === 'live_urn' || patch.drawMode === 'closed_reveal'
      ? patch.drawMode
      : match.drawMode;
    const nextIncludeDoubts = typeof patch.includeDoubts === 'boolean' ? patch.includeDoubts : match.includeDoubts;
    const nextBalanceGk = typeof patch.balanceGk === 'boolean' ? patch.balanceGk : match.balanceGk;
    const nextRevealAll = typeof patch.revealAllPublic === 'boolean' ? patch.revealAllPublic : match.revealAllPublic;

    let nextDrawStatus = match.drawStatus;

    if (patch.drawMode && patch.drawMode !== match.drawMode) {
      needsRedraw = true;
    }

    if (needsRedraw) {
      if (nextDrawMode === 'live_urn') {
        const res = prepareLiveUrn({
          players: nextPlayers,
          teams: nextTeams,
          includeDoubts: nextIncludeDoubts
        });
        nextTeams = res.teams;
        nextPlayers = res.players;
        nextDrawStatus = 'live';
      } else {
        const res = runFullDraw({
          players: nextPlayers,
          teams: nextTeams,
          includeDoubts: nextIncludeDoubts,
          balanceGk: nextBalanceGk,
          revealImmediately: false
        });
        nextTeams = res.teams;
        nextPlayers = res.players;
        nextDrawStatus = 'drawn';
      }
    }

    let nextAdminPin = match.adminPin;
    let nextAdminToken = match.adminToken;
    if (patch.adminPin !== undefined) {
      const cleanPin = String(patch.adminPin).trim();
      if (cleanPin.length < MIN_PIN_LENGTH) {
        throw new Error(`O PIN do organizador precisa ter pelo menos ${MIN_PIN_LENGTH} caracteres.`);
      }
      if (cleanPin !== match.adminPin) {
        nextAdminPin = cleanPin;
        // Rotate adminToken when PIN changes so previously shared direct links expire
        nextAdminToken = generateAdminToken();
      }
    }

    let nextGroupName = match.groupName;
    if (patch.groupName !== undefined) {
      const cleanedGroup = cleanText(patch.groupName, 60);
      if (cleanedGroup.length < 2) {
        throw new Error('O nome da pelada precisa ter pelo menos 2 letras.');
      }
      nextGroupName = cleanedGroup;
    }
    const nextTitle = patch.title !== undefined ? cleanText(patch.title, 80) : match.meta.title;
    const nextDateLabel = patch.dateLabel !== undefined ? cleanText(patch.dateLabel, 40) : match.meta.dateLabel;
    const nextTimeLabel = patch.timeLabel !== undefined ? cleanText(patch.timeLabel, 20) : match.meta.timeLabel;
    const nextArrivalNote = patch.arrivalNote !== undefined ? cleanText(patch.arrivalNote, 60) : match.meta.arrivalNote;
    const nextFeeAmount = patch.feeAmount !== undefined ? parseFeeAmount(patch.feeAmount) : match.meta.feeAmount;
    const nextFeeLabel =
      patch.feeLabel !== undefined
        ? cleanText(patch.feeLabel, 40)
        : patch.feeAmount !== undefined
          ? nextFeeAmount > 0
            ? `R$ ${nextFeeAmount}`
            : ''
          : match.meta.feeLabel;

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `UPDATE matches SET
             group_name = ?, title = ?, date_label = ?, time_label = ?, arrival_note = ?,
             fee_label = ?, fee_amount = ?, draw_mode = ?, draw_status = ?,
             reveal_all_public = ?, include_doubts = ?, balance_gk = ?,
             teams_json = ?, admin_pin = ?, admin_token = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          nextGroupName,
          nextTitle,
          nextDateLabel,
          nextTimeLabel,
          nextArrivalNote,
          nextFeeLabel,
          nextFeeAmount,
          nextDrawMode,
          nextDrawStatus,
          nextRevealAll ? 1 : 0,
          nextIncludeDoubts ? 1 : 0,
          nextBalanceGk ? 1 : 0,
          JSON.stringify(nextTeams),
          nextAdminPin,
          nextAdminToken,
          now,
          match.id
        );

      if (needsRedraw) {
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, nextPlayers);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: nextAdminToken });
  }

  executeDrawAction(slug, action) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (action === 'reveal_all') {
        this.db
          .prepare('UPDATE matches SET reveal_all_public = 1, updated_at = ? WHERE id = ?')
          .run(now, match.id);
        this.db
          .prepare(
            `UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, ?)
             WHERE match_id = ? AND team_id IS NOT NULL`
          )
          .run(now, match.id);
      } else if (action === 'hide_all') {
        this.db
          .prepare('UPDATE matches SET reveal_all_public = 0, updated_at = ? WHERE id = ?')
          .run(now, match.id);
      } else if (action === 'open_live_urn') {
        const res = prepareLiveUrn({
          players: match.players,
          teams: match.teams,
          includeDoubts: match.includeDoubts
        });
        this.db
          .prepare(
            `UPDATE matches SET draw_mode = 'live_urn', draw_status = 'live',
             reveal_all_public = 0, teams_json = ?, updated_at = ? WHERE id = ?`
          )
          .run(JSON.stringify(res.teams), now, match.id);
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, res.players);
      } else {
        // Default: run_full_draw ('closed_reveal')
        const res = runFullDraw({
          players: match.players,
          teams: match.teams,
          includeDoubts: match.includeDoubts,
          balanceGk: match.balanceGk,
          revealImmediately: action === 'draw_and_reveal'
        });
        this.db
          .prepare(
            `UPDATE matches SET draw_mode = 'closed_reveal', draw_status = 'drawn',
             reveal_all_public = ?, teams_json = ?, updated_at = ? WHERE id = ?`
          )
          .run(action === 'draw_and_reveal' ? 1 : 0, JSON.stringify(res.teams), now, match.id);
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, res.players);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  addPlayer(slug, input) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const name = String(input.name || '').trim();
    if (!name) throw new Error('Informe o nome do jogador.');

    const parsedListNumber = Number(input.listNumber);
    const listNumber = Number.isInteger(parsedListNumber) && parsedListNumber > 0 ? parsedListNumber : null;
    const role = input.role === 'gk' ? 'gk' : 'outfield';
    const status = ['confirmed', 'doubt', 'waiting', 'out'].includes(input.status)
      ? input.status
      : 'confirmed';
    const isGuest = Boolean(input.isGuest);
    const note = String(input.note || '').trim();
    const maxSort = match.players.reduce((m, p) => Math.max(m, p.sortOrder), 0);

    const newPlayer = {
      id: randomUUID(),
      listNumber,
      name,
      role,
      status,
      isGuest,
      note,
      paid: Boolean(input.paid),
      arrived: false,
      teamId: null,
      revealed: false,
      revealedAt: null,
      sortOrder: maxSort + 1
    };

    let nextPlayers = [...match.players, newPlayer];
    if (input.autoAssign && status === 'confirmed') {
      const assigned = assignSinglePlayerFromUrn({
        playerId: newPlayer.id,
        players: nextPlayers,
        teams: match.teams,
        balanceGk: match.balanceGk
      });
      nextPlayers = assigned.players.map((p) =>
        p.id === newPlayer.id ? { ...p, revealed: Boolean(input.revealNow), arrived: Boolean(input.revealNow) } : p
      );
    }

    const nextOpenSlots = listNumber
      ? match.openSlots.filter((s) => s.listNumber !== listNumber)
      : match.openSlots;

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('UPDATE matches SET open_slots_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(nextOpenSlots), now, match.id);
      this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
      this.insertPlayers(match.id, nextPlayers);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  updatePlayer(slug, playerId, patch = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const existing = match.players.find((p) => p.id === playerId);
    if (!existing) throw new Error('Jogador não encontrado.');

    if (patch.delete) {
      this.db.prepare('DELETE FROM players WHERE id = ? AND match_id = ?').run(playerId, match.id);
      this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), match.id);
      return this.getMatchForClient(slug, { adminToken: match.adminToken });
    }

    if (patch.drawNow) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const res = assignSinglePlayerFromUrn({
          playerId,
          players: match.players,
          teams: match.teams,
          balanceGk: match.balanceGk
        });
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, res.players);
        this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), match.id);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
      return this.getMatchForClient(slug, { adminToken: match.adminToken });
    }

    const nextName = patch.name !== undefined ? String(patch.name).trim() || existing.name : existing.name;
    const nextRole = patch.role === 'gk' || patch.role === 'outfield' ? patch.role : existing.role;
    const nextStatus = ['confirmed', 'doubt', 'waiting', 'out'].includes(patch.status)
      ? patch.status
      : existing.status;
    const nextPaid = typeof patch.paid === 'boolean' ? patch.paid : existing.paid;
    const nextArrived = typeof patch.arrived === 'boolean' ? patch.arrived : existing.arrived;
    const nextNote = patch.note !== undefined ? String(patch.note).trim() : existing.note;
    const nextIsGuest = typeof patch.isGuest === 'boolean' ? patch.isGuest : existing.isGuest;
    const nextTeamId = patch.teamId !== undefined ? patch.teamId || null : existing.teamId;
    const nextRevealed =
      typeof patch.revealed === 'boolean'
        ? patch.revealed
        : patch.teamId !== undefined && patch.teamId !== existing.teamId && patch.teamId
          ? true
          : existing.revealed;

    this.db
      .prepare(
        `UPDATE players SET
           name = ?, role = ?, status = ?, is_guest = ?, note = ?,
           paid = ?, arrived = ?, team_id = ?, revealed = ?
         WHERE id = ? AND match_id = ?`
      )
      .run(
        nextName,
        nextRole,
        nextStatus,
        nextIsGuest ? 1 : 0,
        nextNote,
        nextPaid ? 1 : 0,
        nextArrived ? 1 : 0,
        nextStatus === 'out' ? null : nextTeamId,
        nextRevealed ? 1 : 0,
        playerId,
        match.id
      );

    this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), match.id);
    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  /**
   * Player-triggered reveal or live-urn draw.
   * Atomically assigns a team if in live_urn mode, marks revealed = true,
   * and returns the drawn team and currently revealed teammates.
   */
  revealPlayerTeam(slug, playerId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const match = this.getMatchRaw(slug);
      if (!match) {
        this.db.exec('ROLLBACK');
        return null;
      }

      const player = match.players.find((p) => p.id === playerId);
      if (!player) {
        this.db.exec('ROLLBACK');
        throw new Error('Jogador não encontrado na lista.');
      }

      if (player.status === 'out' || player.status === 'waiting') {
        this.db.exec('ROLLBACK');
        throw new Error('Este jogador ainda não está confirmado para o sorteio.');
      }

      if (player.status === 'doubt' && !match.includeDoubts && !player.teamId) {
        this.db.exec('ROLLBACK');
        throw new Error('Jogador marcado como dúvida. O organizador precisa confirmar antes de sortear.');
      }

      const nowIso = new Date().toISOString();
      let assignedTeamId = player.teamId;

      if (!assignedTeamId) {
        const res = assignSinglePlayerFromUrn({
          playerId,
          players: match.players,
          teams: match.teams,
          balanceGk: match.balanceGk
        });
        assignedTeamId = res.teamId;
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, res.players);
      } else if (!player.revealed) {
        this.db
          .prepare(
            'UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, ?), arrived = 1 WHERE id = ?'
          )
          .run(nowIso, playerId);
      }

      this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(nowIso, match.id);
      this.db.exec('COMMIT');

      const refreshed = this.getMatchForClient(slug);
      const updatedPlayer = refreshed.players.find((p) => p.id === playerId);
      const team = refreshed.teams.find((t) => t.id === assignedTeamId);
      const teammates = refreshed.players.filter(
        (p) => p.teamId === assignedTeamId && p.id !== playerId
      );

      return {
        player: updatedPlayer,
        team,
        teammates,
        match: refreshed
      };
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw err;
    }
  }
}
