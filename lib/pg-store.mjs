import pg from 'pg';
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
  hydrateMatchRow,
  isAuthorized as checkAuthorized,
  normalizeSlugList,
  prepareNewMatchData,
  slugify
} from './match-logic.mjs';

const { Pool } = pg;

export { MIN_PIN_LENGTH, slugify };

export function resolvePostgresUrl(override) {
  return String(
    override ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      ''
  ).trim();
}

export function buildPoolConfig(connectionString) {
  const base = {
    connectionString,
    max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  };

  try {
    const parsed = new URL(connectionString);
    const sslmode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);

    if (sslmode === 'disable' || (isLocal && !sslmode)) {
      return { ...base, ssl: false };
    }

    if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca') {
      if (parsed.hostname.endsWith('.neon.tech')) {
        // Avoid pg v8.23+ deprecation warning while keeping strict TLS validation on Neon
        parsed.searchParams.set('sslmode', 'verify-full');
        return { ...base, connectionString: parsed.toString() };
      }
      parsed.searchParams.delete('sslmode');
      return { ...base, connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
    }

    if (!sslmode && !isLocal) {
      return { ...base, ssl: { rejectUnauthorized: false } };
    }
  } catch {
    // Fallback to raw connectionString
  }

  return base;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    group_name TEXT NOT NULL,
    title TEXT NOT NULL,
    date_label TEXT NOT NULL,
    time_label TEXT NOT NULL,
    arrival_note TEXT NOT NULL DEFAULT '',
    fee_label TEXT NOT NULL DEFAULT '',
    fee_amount DOUBLE PRECISION NOT NULL DEFAULT 10,
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
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
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
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_players_match ON players(match_id, sort_order);
`;

export class PostgresStore {
  constructor(connectionStringOrPool, options = {}) {
    if (options.pool) {
      this.pool = options.pool;
    } else if (
      connectionStringOrPool &&
      typeof connectionStringOrPool === 'object' &&
      typeof connectionStringOrPool.query === 'function'
    ) {
      this.pool = connectionStringOrPool;
    } else {
      const url = resolvePostgresUrl(connectionStringOrPool);
      if (!url) {
        throw new Error('DATABASE_URL/POSTGRES_URL não configurada para o PostgresStore.');
      }
      this.pool = new Pool(buildPoolConfig(url));
    }
    this.initPromise = null;
  }

  async ensureInit() {
    if (!this.initPromise) {
      this.initPromise = this.pool.query(SCHEMA_SQL).catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  async close() {
    try {
      await this.pool.end();
    } catch {
      // already closed
    }
  }

  async insertPlayers(client, matchId, players) {
    if (!players || players.length === 0) return;

    const values = [];
    const tuples = [];
    players.forEach((p, idx) => {
      const base = idx * 14;
      tuples.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`
      );
      values.push(
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

    await client.query(
      `INSERT INTO players (
        id, match_id, list_number, name, role, status, is_guest, note,
        paid, arrived, team_id, revealed, revealed_at, sort_order
      ) VALUES ${tuples.join(', ')}`,
      values
    );
  }

  async loadMatchRawWithClient(client, slug, { forUpdate = false } = {}) {
    const sql = forUpdate
      ? 'SELECT * FROM matches WHERE slug = $1 FOR UPDATE'
      : 'SELECT * FROM matches WHERE slug = $1';
    const res = await client.query(sql, [slug]);
    const row = res.rows[0];
    if (!row) return null;

    const playerRes = await client.query(
      'SELECT * FROM players WHERE match_id = $1 ORDER BY sort_order ASC, id ASC',
      [row.id]
    );
    return hydrateMatchRow(row, playerRes.rows);
  }

  async withMatchLock(slug, fn) {
    await this.ensureInit();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const match = await this.loadMatchRawWithClient(client, slug, { forUpdate: true });
      if (!match) {
        await client.query('ROLLBACK');
        return null;
      }
      const result = await fn(client, match);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listMatches() {
    await this.ensureInit();
    const res = await this.pool.query(
      `SELECT slug, group_name AS "groupName", title, date_label AS "dateLabel",
              time_label AS "timeLabel", draw_mode AS "drawMode", draw_status AS "drawStatus",
              updated_at AS "updatedAt"
       FROM matches ORDER BY created_at DESC`
    );
    return res.rows;
  }

  async listMatchesBySlugs(slugs = []) {
    const unique = normalizeSlugList(slugs);
    if (unique.length === 0) return [];
    await this.ensureInit();
    const res = await this.pool.query(
      `SELECT slug, group_name AS "groupName", title, date_label AS "dateLabel",
              time_label AS "timeLabel", draw_mode AS "drawMode", draw_status AS "drawStatus",
              updated_at AS "updatedAt"
       FROM matches WHERE slug = ANY($1::text[]) ORDER BY updated_at DESC`,
      [unique]
    );
    return res.rows;
  }

  async getMatchRaw(slug) {
    await this.ensureInit();
    return this.loadMatchRawWithClient(this.pool, slug, { forUpdate: false });
  }

  isAuthorized(match, auth = {}) {
    return checkAuthorized(match, auth);
  }

  async getMatchForClient(slug, auth = {}) {
    const raw = await this.getMatchRaw(slug);
    return formatMatchForClient(raw, auth);
  }

  async createMatch(input = {}) {
    const data = prepareNewMatchData(input);
    await this.ensureInit();

    const client = await this.pool.connect();
    let slug = `${data.baseSlug}-${generateRoomCode()}`;
    try {
      await client.query('BEGIN');
      while (true) {
        const exists = await client.query('SELECT 1 FROM matches WHERE slug = $1', [slug]);
        if (exists.rowCount === 0 && exists.rows.length === 0) break;
        slug = `${data.baseSlug}-${generateRoomCode(5)}`;
      }

      await client.query(
        `INSERT INTO matches (
          id, slug, group_name, title, date_label, time_label, arrival_note,
          fee_label, fee_amount, raw_list, draw_mode, draw_status,
          reveal_all_public, include_doubts, balance_gk,
          teams_json, open_slots_json, warnings_json,
          admin_pin, admin_token, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
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
          JSON.stringify(data.teams),
          JSON.stringify(data.openSlots),
          JSON.stringify(data.warnings),
          data.adminPin,
          data.adminToken,
          data.now,
          data.now
        ]
      );
      await this.insertPlayers(client, data.matchId, data.players);
      const fresh = await this.loadMatchRawWithClient(client, slug);
      await client.query('COMMIT');
      return formatMatchForClient(fresh, { adminToken: data.adminToken });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async importRawList(slug, rawList, opts = {}) {
    return this.withMatchLock(slug, async (client, match) => {
      const patch = computeImportPatch(match, rawList, opts);
      await client.query(
        `UPDATE matches SET
           title = $1, date_label = $2, time_label = $3, arrival_note = $4,
           fee_label = $5, fee_amount = $6, raw_list = $7,
           draw_status = $8, reveal_all_public = 0,
           teams_json = $9, open_slots_json = $10, warnings_json = $11, updated_at = $12
         WHERE id = $13`,
        [
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
        ]
      );

      await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
      await this.insertPlayers(client, match.id, patch.players);
      const fresh = await this.loadMatchRawWithClient(client, slug);
      return formatMatchForClient(fresh, { adminToken: match.adminToken });
    });
  }

  async updateSettings(slug, rawPatch = {}) {
    return this.withMatchLock(slug, async (client, match) => {
      const next = computeSettingsPatch(match, rawPatch);
      await client.query(
        `UPDATE matches SET
           group_name = $1, title = $2, date_label = $3, time_label = $4, arrival_note = $5,
           fee_label = $6, fee_amount = $7, draw_mode = $8, draw_status = $9,
           reveal_all_public = $10, include_doubts = $11, balance_gk = $12,
           teams_json = $13, admin_pin = $14, admin_token = $15, updated_at = $16
         WHERE id = $17`,
        [
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
          JSON.stringify(next.teams),
          next.adminPin,
          next.adminToken,
          next.updatedAt,
          match.id
        ]
      );

      if (next.needsRedraw) {
        await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
        await this.insertPlayers(client, match.id, next.players);
      }

      const fresh = await this.loadMatchRawWithClient(client, slug);
      return formatMatchForClient(fresh, { adminToken: next.adminToken });
    });
  }

  async executeDrawAction(slug, action) {
    return this.withMatchLock(slug, async (client, match) => {
      const patch = computeDrawActionPatch(match, action);
      if (patch.kind === 'reveal_all') {
        await client.query(
          'UPDATE matches SET reveal_all_public = 1, updated_at = $1 WHERE id = $2',
          [patch.updatedAt, match.id]
        );
        await client.query(
          `UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, $1)
           WHERE match_id = $2 AND team_id IS NOT NULL`,
          [patch.updatedAt, match.id]
        );
      } else if (patch.kind === 'hide_all') {
        await client.query(
          'UPDATE matches SET reveal_all_public = 0, updated_at = $1 WHERE id = $2',
          [patch.updatedAt, match.id]
        );
      } else {
        await client.query(
          `UPDATE matches SET draw_mode = $1, draw_status = $2,
           reveal_all_public = $3, teams_json = $4, updated_at = $5 WHERE id = $6`,
          [
            patch.drawMode,
            patch.drawStatus,
            patch.revealAllPublic ? 1 : 0,
            JSON.stringify(patch.teams),
            patch.updatedAt,
            match.id
          ]
        );
        await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
        await this.insertPlayers(client, match.id, patch.players);
      }

      const fresh = await this.loadMatchRawWithClient(client, slug);
      return formatMatchForClient(fresh, { adminToken: match.adminToken });
    });
  }

  async addPlayer(slug, input) {
    return this.withMatchLock(slug, async (client, match) => {
      const patch = computeAddPlayerPatch(match, input);
      await client.query(
        'UPDATE matches SET open_slots_json = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(patch.nextOpenSlots), patch.updatedAt, match.id]
      );
      await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
      await this.insertPlayers(client, match.id, patch.nextPlayers);

      const fresh = await this.loadMatchRawWithClient(client, slug);
      return formatMatchForClient(fresh, { adminToken: match.adminToken });
    });
  }

  async updatePlayer(slug, playerId, rawPatch = {}) {
    return this.withMatchLock(slug, async (client, match) => {
      const patch = computeUpdatePlayerPatch(match, playerId, rawPatch);

      if (patch.kind === 'delete') {
        await client.query('DELETE FROM players WHERE id = $1 AND match_id = $2', [playerId, match.id]);
        await client.query('UPDATE matches SET updated_at = $1 WHERE id = $2', [patch.updatedAt, match.id]);
      } else if (patch.kind === 'drawNow') {
        await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
        await this.insertPlayers(client, match.id, patch.nextPlayers);
        await client.query('UPDATE matches SET updated_at = $1 WHERE id = $2', [patch.updatedAt, match.id]);
      } else {
        const { fields } = patch;
        await client.query(
          `UPDATE players SET
             name = $1, role = $2, status = $3, is_guest = $4, note = $5,
             paid = $6, arrived = $7, team_id = $8, revealed = $9
           WHERE id = $10 AND match_id = $11`,
          [
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
          ]
        );
        await client.query('UPDATE matches SET updated_at = $1 WHERE id = $2', [patch.updatedAt, match.id]);
      }

      const fresh = await this.loadMatchRawWithClient(client, slug);
      return formatMatchForClient(fresh, { adminToken: match.adminToken });
    });
  }

  async revealPlayerTeam(slug, playerId) {
    return this.withMatchLock(slug, async (client, match) => {
      const res = computeRevealPlayerResult(match, playerId);

      if (res.kind === 'assigned') {
        await client.query('DELETE FROM players WHERE match_id = $1', [match.id]);
        await this.insertPlayers(client, match.id, res.nextPlayers);
      } else if (res.kind === 'reveal_only') {
        await client.query(
          'UPDATE players SET revealed = 1, revealed_at = COALESCE(revealed_at, $1), arrived = 1 WHERE id = $2 AND match_id = $3',
          [res.nowIso, playerId, match.id]
        );
      }

      await client.query('UPDATE matches SET updated_at = $1 WHERE id = $2', [res.nowIso, match.id]);

      const freshRaw = await this.loadMatchRawWithClient(client, slug);
      const refreshed = formatMatchForClient(freshRaw);
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
    });
  }
}
