import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MIN_PIN_LENGTH,
  computeAddPlayerPatch,
  computeDrawActionPatch,
  computeImportPatch,
  computeRevealPlayerResult,
  computeSettingsPatch,
  computeUpdatePlayerPatch,
  formatMatchForClient,
  generateRoomCode,
  getSchemaMigrations,
  hydrateMatchRow,
  isAuthorized as checkAuthorized,
  normalizeSlugList,
  prepareNewMatchData,
  slugify
} from './match-logic.mjs';

export { MIN_PIN_LENGTH, slugify };

export function resolveDefaultDbPath() {
  if (process.env.SORTEIOFC_DB_PATH) {
    return process.env.SORTEIOFC_DB_PATH;
  }
  if (process.env.TIRATIME_DB_PATH) {
    return process.env.TIRATIME_DB_PATH;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return path.join(os.tmpdir(), 'sorteiofc.db');
  }
  const primary = path.resolve(process.cwd(), 'data', 'sorteiofc.db');
  const legacy = path.resolve(process.cwd(), 'data', 'tiratime.db');
  if (!fs.existsSync(primary) && fs.existsSync(legacy)) {
    return legacy;
  }
  return primary;
}

export class PeladaStore {
  constructor(dbPath = resolveDefaultDbPath()) {
    let targetPath = dbPath;
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      this.db = new DatabaseSync(targetPath);
    } catch {
      targetPath = path.join(os.tmpdir(), 'sorteiofc.db');
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
        lock_one_per_device INTEGER NOT NULL DEFAULT 0,
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
    `);
    this.runMigrations();
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_players_match ON players(match_id, sort_order);');
  }

  runMigrations() {
    const existingByTable = {
      matches: new Set(this.db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name)),
      players: new Set(this.db.prepare('PRAGMA table_info(players)').all().map((c) => c.name))
    };
    for (const { table, column, definition } of getSchemaMigrations('sqlite')) {
      const existing = existingByTable[table];
      if (existing && !existing.has(column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        existing.add(column);
      }
    }
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
        p.id,
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

  /** Public summaries only for the slugs the browser already knows (no global listing). */
  listMatchesBySlugs(slugs = []) {
    const unique = normalizeSlugList(slugs);
    if (unique.length === 0) return [];
    const placeholders = unique.map(() => '?').join(', ');
    return this.db
      .prepare(
        `SELECT m.slug, m.group_name as groupName, m.title, m.date_label as dateLabel,
                m.time_label as timeLabel, m.fee_label as feeLabel, m.draw_mode as drawMode,
                m.draw_status as drawStatus, m.updated_at as updatedAt,
                (SELECT COUNT(*) FROM players p WHERE p.match_id = m.id) as playerCount
         FROM matches m WHERE m.slug IN (${placeholders}) ORDER BY m.updated_at DESC`
      )
      .all(...unique);
  }

  getMatchRaw(slug) {
    const row = this.db.prepare('SELECT * FROM matches WHERE slug = ?').get(slug);
    if (!row) return null;

    const playerRows = this.db
      .prepare('SELECT * FROM players WHERE match_id = ? ORDER BY sort_order ASC, rowid ASC')
      .all(row.id);

    return hydrateMatchRow(row, playerRows);
  }

  isAuthorized(match, auth = {}) {
    return checkAuthorized(match, auth);
  }

  getMatchForClient(slug, auth = {}) {
    return formatMatchForClient(this.getMatchRaw(slug), auth);
  }

  createMatch(input = {}) {
    const data = prepareNewMatchData(input);
    let slug = `${data.baseSlug}-${generateRoomCode()}`;
    while (this.db.prepare('SELECT 1 FROM matches WHERE slug = ?').get(slug)) {
      slug = `${data.baseSlug}-${generateRoomCode(5)}`;
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO matches (
            id, slug, group_name, title, date_label, time_label, arrival_note,
            fee_label, fee_amount, raw_list, draw_mode, draw_status,
            reveal_all_public, include_doubts, balance_gk, lock_one_per_device,
            teams_json, open_slots_json, warnings_json,
            admin_pin, admin_token, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.matchId,
          slug,
          data.groupName,
          data.meta.title,
          data.meta.dateLabel,
          data.meta.timeLabel,
          data.meta.arrivalNote,
          data.meta.feeLabel,
          data.meta.feeAmount,
          data.rawList,
          data.drawMode,
          data.drawStatus,
          0,
          0,
          1,
          data.lockOnePerDevice ? 1 : 0,
          JSON.stringify(data.teams),
          JSON.stringify(data.openSlots),
          JSON.stringify(data.warnings),
          data.adminPin,
          data.adminToken,
          data.now,
          data.now
        );
      this.insertPlayers(data.matchId, data.players);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: data.adminToken });
  }

  importRawList(slug, rawList, opts = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const patch = computeImportPatch(match, rawList, opts);
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
          patch.title,
          patch.dateLabel,
          patch.timeLabel,
          patch.arrivalNote,
          patch.feeLabel,
          patch.feeAmount,
          patch.rawList,
          patch.drawStatus,
          JSON.stringify(patch.teams),
          JSON.stringify(patch.openSlots),
          JSON.stringify(patch.warnings),
          patch.updatedAt,
          match.id
        );

      this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
      this.insertPlayers(match.id, patch.players);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  updateSettings(slug, rawPatch = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const next = computeSettingsPatch(match, rawPatch);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `UPDATE matches SET
             group_name = ?, title = ?, date_label = ?, time_label = ?, arrival_note = ?,
             fee_label = ?, fee_amount = ?, draw_mode = ?, draw_status = ?,
             reveal_all_public = ?, include_doubts = ?, balance_gk = ?, lock_one_per_device = ?,
             teams_json = ?, admin_pin = ?, admin_token = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          next.groupName,
          next.title,
          next.dateLabel,
          next.timeLabel,
          next.arrivalNote,
          next.feeLabel,
          next.feeAmount,
          next.drawMode,
          next.drawStatus,
          next.revealAllPublic ? 1 : 0,
          next.includeDoubts ? 1 : 0,
          next.balanceGk ? 1 : 0,
          next.lockOnePerDevice ? 1 : 0,
          JSON.stringify(next.teams),
          next.adminPin,
          next.adminToken,
          next.updatedAt,
          match.id
        );

      if (next.needsRedraw) {
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, next.players);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: next.adminToken });
  }

  executeDrawAction(slug, action) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const patch = computeDrawActionPatch(match, action);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (patch.kind === 'reveal_all') {
        this.db
          .prepare('UPDATE matches SET reveal_all_public = 1, updated_at = ? WHERE id = ?')
          .run(patch.updatedAt, match.id);
        this.db
          .prepare(
            `UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, ?)
             WHERE match_id = ? AND team_id IS NOT NULL`
          )
          .run(patch.updatedAt, match.id);
      } else if (patch.kind === 'hide_all') {
        this.db
          .prepare('UPDATE matches SET reveal_all_public = 0, updated_at = ? WHERE id = ?')
          .run(patch.updatedAt, match.id);
      } else {
        this.db
          .prepare(
            `UPDATE matches SET draw_mode = ?, draw_status = ?,
             reveal_all_public = ?, teams_json = ?, open_slots_json = ?, raw_list = ?, warnings_json = ?, updated_at = ? WHERE id = ?`
          )
          .run(
            patch.drawMode,
            patch.drawStatus,
            patch.revealAllPublic ? 1 : 0,
            JSON.stringify(patch.teams),
            JSON.stringify(patch.openSlots !== undefined ? patch.openSlots : match.openSlots || []),
            patch.rawList !== undefined ? patch.rawList : match.rawList,
            JSON.stringify(patch.warnings !== undefined ? patch.warnings : match.warnings || []),
            patch.updatedAt,
            match.id
          );
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, patch.players);
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

    const patch = computeAddPlayerPatch(match, input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('UPDATE matches SET open_slots_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(patch.nextOpenSlots), patch.updatedAt, match.id);
      this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
      this.insertPlayers(match.id, patch.nextPlayers);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  updatePlayer(slug, playerId, rawPatch = {}) {
    const match = this.getMatchRaw(slug);
    if (!match) return null;

    const patch = computeUpdatePlayerPatch(match, playerId, rawPatch);

    if (patch.kind === 'delete') {
      this.db.prepare('DELETE FROM players WHERE id = ? AND match_id = ?').run(playerId, match.id);
      this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(patch.updatedAt, match.id);
      return this.getMatchForClient(slug, { adminToken: match.adminToken });
    }

    if (patch.kind === 'drawNow') {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, patch.nextPlayers);
        this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(patch.updatedAt, match.id);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
      return this.getMatchForClient(slug, { adminToken: match.adminToken });
    }

    const { fields } = patch;
    this.db
      .prepare(
        `UPDATE players SET
           name = ?, role = ?, status = ?, is_guest = ?, note = ?,
           paid = ?, arrived = ?, team_id = ?, revealed = ?
         WHERE id = ? AND match_id = ?`
      )
      .run(
        fields.name,
        fields.role,
        fields.status,
        fields.isGuest ? 1 : 0,
        fields.note,
        fields.paid ? 1 : 0,
        fields.arrived ? 1 : 0,
        fields.teamId,
        fields.revealed ? 1 : 0,
        playerId,
        match.id
      );

    this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(patch.updatedAt, match.id);
    return this.getMatchForClient(slug, { adminToken: match.adminToken });
  }

  deleteMatch(slug) {
    const info = this.db.prepare('DELETE FROM matches WHERE slug = ?').run(slug);
    return info.changes > 0;
  }

  revealPlayerTeam(slug, playerId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const match = this.getMatchRaw(slug);
      if (!match) {
        this.db.exec('ROLLBACK');
        return null;
      }

      const res = computeRevealPlayerResult(match, playerId);

      if (res.kind === 'assigned') {
        this.db.prepare('DELETE FROM players WHERE match_id = ?').run(match.id);
        this.insertPlayers(match.id, res.nextPlayers);
      } else if (res.kind === 'reveal_only') {
        this.db
          .prepare(
            'UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, ?), arrived = 1 WHERE id = ?'
          )
          .run(res.nowIso, playerId);
      }

      this.db.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').run(res.nowIso, match.id);
      this.db.exec('COMMIT');

      const refreshed = this.getMatchForClient(slug);
      const updatedPlayer = refreshed.players.find((p) => p.id === playerId);
      const team = refreshed.teams.find((t) => t.id === res.assignedTeamId);
      const teammates = refreshed.players.filter(
        (p) => p.teamId === res.assignedTeamId && p.id !== playerId
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
