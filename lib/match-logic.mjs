import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
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

/**
 * Returns ordered incremental column definitions shared by SQLite and Postgres
 * so pre-existing databases safely add new columns via ALTER TABLE.
 */
export function getSchemaMigrations(dialect = 'sqlite') {
  const floatType = dialect === 'postgres' ? 'DOUBLE PRECISION' : 'REAL';
  return [
    { table: 'matches', column: 'arrival_note', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'matches', column: 'fee_label', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'matches', column: 'fee_amount', definition: `${floatType} NOT NULL DEFAULT 10` },
    { table: 'matches', column: 'raw_list', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'matches', column: 'draw_mode', definition: "TEXT NOT NULL DEFAULT 'closed_reveal'" },
    { table: 'matches', column: 'draw_status', definition: "TEXT NOT NULL DEFAULT 'drawn'" },
    { table: 'matches', column: 'reveal_all_public', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'matches', column: 'include_doubts', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'matches', column: 'balance_gk', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { table: 'matches', column: 'lock_one_per_device', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'matches', column: 'open_slots_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { table: 'matches', column: 'warnings_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { table: 'players', column: 'list_number', definition: 'INTEGER' },
    { table: 'players', column: 'role', definition: "TEXT NOT NULL DEFAULT 'outfield'" },
    { table: 'players', column: 'status', definition: "TEXT NOT NULL DEFAULT 'confirmed'" },
    { table: 'players', column: 'is_guest', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'players', column: 'note', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'players', column: 'paid', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'players', column: 'arrived', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'players', column: 'team_id', definition: 'TEXT' },
    { table: 'players', column: 'revealed', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'players', column: 'revealed_at', definition: 'TEXT' },
    { table: 'players', column: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' }
  ];
}

export function generateAdminToken() {
  return randomBytes(24).toString('hex');
}

export function generateRoomCode(length = 4) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function parseFeeAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

export function cleanText(value, max = 60) {
  return String(value ?? '').trim().slice(0, max);
}

export function safeSecretEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const trimmedProvided = provided.trim();
  const trimmedExpected = expected.trim();
  if (!trimmedProvided || !trimmedExpected) return false;
  const a = createHash('sha256').update(trimmedProvided, 'utf8').digest();
  const b = createHash('sha256').update(trimmedExpected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function slugify(text) {
  return (
    String(text || 'pelada')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'pelada'
  );
}

export function normalizeSlugList(slugs = []) {
  return [...new Set(slugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

export function hydrateMatchRow(row, playerRows) {
  if (!row) return null;
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
    lockOnePerDevice: Boolean(row.lock_one_per_device),
    teams: normalizeTeams(JSON.parse(row.teams_json)),
    openSlots: JSON.parse(row.open_slots_json),
    warnings: JSON.parse(row.warnings_json),
    adminPin: row.admin_pin,
    adminToken: row.admin_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    players: playerRows.map((p) => ({
      id: p.id,
      listNumber: p.list_number === null || p.list_number === undefined ? null : Number(p.list_number),
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
      sortOrder: Number(p.sort_order)
    }))
  };
}

export function isAuthorized(match, auth = {}) {
  if (!match || !auth || typeof auth !== 'object') return false;
  if (safeSecretEqual(auth.adminToken, match.adminToken)) return true;
  if (safeSecretEqual(auth.adminPin, match.adminPin)) return true;
  return false;
}

export function formatMatchForClient(match, auth = {}) {
  if (!match) return null;
  const isAdmin = isAuthorized(match, auth);
  const hideUnrevealed = !isAdmin && !match.revealAllPublic;

  const sanitizedPlayers = match.players.map((p) => ({
    ...p,
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

function normalizePlayersForPersistence(players) {
  return players.map((p, idx) => ({
    ...p,
    id: p.id || randomUUID(),
    listNumber: p.listNumber ?? null,
    role: p.role || 'outfield',
    status: p.status || 'confirmed',
    isGuest: Boolean(p.isGuest),
    note: p.note || '',
    paid: Boolean(p.paid),
    arrived: Boolean(p.arrived),
    teamId: p.teamId ?? null,
    revealed: Boolean(p.revealed),
    revealedAt: p.revealedAt ?? null,
    sortOrder: p.sortOrder ?? idx + 1
  }));
}

export function prepareNewMatchData({
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
  const resolvedTeamCount = Math.min(
    4,
    Math.max(2, Math.round(Number(teamCount) || (parsed ? parsed.summary.suggestedTeams : 2)))
  );
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

  return {
    matchId: randomUUID(),
    baseSlug,
    groupName: cleanGroup,
    meta,
    rawList: text,
    drawMode: mode,
    drawStatus: prepared.drawStatus,
    lockOnePerDevice: false,
    teams: prepared.teams,
    openSlots: parsed ? parsed.openSlots : [],
    warnings: parsed ? parsed.warnings : [],
    adminPin: rawPin,
    adminToken: generateAdminToken(),
    now: new Date().toISOString(),
    players: normalizePlayersForPersistence(prepared.players)
  };
}

export function computeImportPatch(match, rawList, { autoDraw = true } = {}) {
  const parsed = parseWhatsAppList(rawList);
  if (parsed.players.length === 0) {
    throw new Error('Nenhum jogador identificado na lista. Verifique os números (ex: 1- Nome).');
  }

  const previousByName = new Map(
    match.players.map((p) => [p.name.trim().toLowerCase(), p])
  );
  const mergedPlayers = parsed.players.map((p) => {
    const prev = previousByName.get(p.name.trim().toLowerCase());
    return prev ? { ...p, paid: prev.paid } : p;
  });

  const currentOutfieldCap = Number(match.teams[0]?.outfieldCap) || DEFAULT_OUTFIELD_PER_TEAM;
  const shouldAutoSizeTeams = match.players.length === 0 && parsed.summary?.suggestedTeams >= 2;
  const teams = shouldAutoSizeTeams
    ? buildDefaultTeams(parsed.summary.suggestedTeams, currentOutfieldCap)
    : match.teams.length >= 2
      ? match.teams
      : buildDefaultTeams(parsed.summary.suggestedTeams, currentOutfieldCap);

  let result;
  let drawStatus;
  if (!autoDraw) {
    result = { teams, players: mergedPlayers };
    drawStatus = 'draft';
  } else if (match.drawMode === 'live_urn') {
    result = prepareLiveUrn({
      players: mergedPlayers,
      teams,
      includeDoubts: match.includeDoubts,
      balanceGk: match.balanceGk
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

  return {
    title: parsed.meta.title || match.meta.title,
    dateLabel: parsed.meta.dateLabel || match.meta.dateLabel,
    timeLabel: parsed.meta.timeLabel || match.meta.timeLabel,
    arrivalNote: parsed.meta.arrivalNote || match.meta.arrivalNote,
    feeLabel: parsed.meta.feeLabel || match.meta.feeLabel,
    feeAmount: parsed.meta.feeLabel ? parsed.meta.feeAmount : match.meta.feeAmount,
    rawList,
    drawStatus,
    teams: result.teams,
    openSlots: parsed.openSlots,
    warnings: parsed.warnings,
    updatedAt: new Date().toISOString(),
    players: normalizePlayersForPersistence(result.players)
  };
}

export function computeSettingsPatch(match, patch = {}) {
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

  const modeChanged = Boolean(patch.drawMode && patch.drawMode !== match.drawMode);
  const balanceGkChanged = Boolean(typeof patch.balanceGk === 'boolean' && patch.balanceGk !== match.balanceGk);
  const includeDoubtsChanged = Boolean(typeof patch.includeDoubts === 'boolean' && patch.includeDoubts !== match.includeDoubts);
  const nextDrawMode =
    patch.drawMode === 'live_urn' || patch.drawMode === 'closed_reveal'
      ? patch.drawMode
      : match.drawMode;
  const nextIncludeDoubts = typeof patch.includeDoubts === 'boolean' ? patch.includeDoubts : match.includeDoubts;
  const nextBalanceGk = typeof patch.balanceGk === 'boolean' ? patch.balanceGk : match.balanceGk;
  const nextLockOnePerDevice =
    typeof patch.lockOnePerDevice === 'boolean' ? patch.lockOnePerDevice : Boolean(match.lockOnePerDevice);
  const nextRevealAll =
    typeof patch.revealAllPublic === 'boolean'
      ? patch.revealAllPublic
      : modeChanged
        ? false
        : match.revealAllPublic;

  let nextDrawStatus = match.drawStatus;

  if (modeChanged || balanceGkChanged || includeDoubtsChanged) {
    needsRedraw = true;
  }

  if (needsRedraw) {
    if (nextDrawMode === 'live_urn' && !nextRevealAll) {
      const res = prepareLiveUrn({
        players: nextPlayers,
        teams: nextTeams,
        includeDoubts: nextIncludeDoubts,
        balanceGk: nextBalanceGk
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
        revealImmediately: nextRevealAll
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

  return {
    groupName: nextGroupName,
    title: nextTitle,
    dateLabel: nextDateLabel,
    timeLabel: nextTimeLabel,
    arrivalNote: nextArrivalNote,
    feeLabel: nextFeeLabel,
    feeAmount: nextFeeAmount,
    drawMode: nextDrawMode,
    drawStatus: nextDrawStatus,
    revealAllPublic: nextRevealAll,
    includeDoubts: nextIncludeDoubts,
    balanceGk: nextBalanceGk,
    lockOnePerDevice: nextLockOnePerDevice,
    teams: nextTeams,
    adminPin: nextAdminPin,
    adminToken: nextAdminToken,
    updatedAt: new Date().toISOString(),
    needsRedraw,
    players: needsRedraw ? normalizePlayersForPersistence(nextPlayers) : nextPlayers
  };
}

export function computeDrawActionPatch(match, action) {
  const now = new Date().toISOString();
  if (action === 'reveal_all') {
    return { kind: 'reveal_all', updatedAt: now };
  }
  if (action === 'hide_all') {
    return { kind: 'hide_all', updatedAt: now };
  }
  if (action === 'reset_week') {
    const clearedTeams = (match.teams || []).map((t) => ({
      ...t,
      assignedPlayers: [],
      outfieldCount: 0,
      gkCount: 0
    }));
    return {
      kind: 'replace',
      drawMode: match.drawMode,
      drawStatus: 'draft',
      revealAllPublic: false,
      teams: clearedTeams,
      players: [],
      openSlots: [],
      rawList: '',
      warnings: [],
      updatedAt: now
    };
  }
  if (action === 'open_live_urn') {
    const res = prepareLiveUrn({
      players: match.players,
      teams: match.teams,
      includeDoubts: match.includeDoubts,
      balanceGk: match.balanceGk
    });
    return {
      kind: 'replace',
      drawMode: 'live_urn',
      drawStatus: 'live',
      revealAllPublic: false,
      teams: res.teams,
      players: normalizePlayersForPersistence(res.players),
      updatedAt: now
    };
  }

  const revealImmediately = action === 'draw_and_reveal';
  const res = runFullDraw({
    players: match.players,
    teams: match.teams,
    includeDoubts: match.includeDoubts,
    balanceGk: match.balanceGk,
    revealImmediately
  });
  return {
    kind: 'replace',
    drawMode: revealImmediately ? match.drawMode : 'closed_reveal',
    drawStatus: 'drawn',
    revealAllPublic: revealImmediately,
    teams: res.teams,
    players: normalizePlayersForPersistence(res.players),
    updatedAt: now
  };
}

export function computeAddPlayerPatch(match, input) {
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

  return {
    nextOpenSlots,
    nextPlayers: normalizePlayersForPersistence(nextPlayers),
    updatedAt: new Date().toISOString()
  };
}

export function computeUpdatePlayerPatch(match, playerId, patch = {}) {
  const existing = match.players.find((p) => p.id === playerId);
  if (!existing) throw new Error('Jogador não encontrado.');
  const updatedAt = new Date().toISOString();

  if (patch.delete) {
    return { kind: 'delete', updatedAt };
  }

  if (patch.drawNow) {
    const res = assignSinglePlayerFromUrn({
      playerId,
      players: match.players,
      teams: match.teams,
      balanceGk: match.balanceGk
    });
    return {
      kind: 'drawNow',
      nextPlayers: normalizePlayersForPersistence(res.players),
      updatedAt
    };
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

  return {
    kind: 'fields',
    updatedAt,
    fields: {
      name: nextName,
      role: nextRole,
      status: nextStatus,
      isGuest: nextIsGuest,
      note: nextNote,
      paid: nextPaid,
      arrived: nextArrived,
      teamId: nextStatus === 'out' ? null : nextTeamId,
      revealed: nextRevealed
    }
  };
}

export function computeRevealPlayerResult(match, playerId) {
  const player = match.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error('Jogador não encontrado na lista.');
  }

  if (player.status === 'out' || player.status === 'waiting') {
    throw new Error('Este jogador ainda não está confirmado para o sorteio.');
  }

  if (player.status === 'doubt' && !match.includeDoubts && !player.teamId) {
    throw new Error('Jogador marcado como dúvida. O organizador precisa confirmar antes de sortear.');
  }

  const nowIso = new Date().toISOString();

  if (!player.teamId) {
    const res = assignSinglePlayerFromUrn({
      playerId,
      players: match.players,
      teams: match.teams,
      balanceGk: match.balanceGk
    });
    return {
      kind: 'assigned',
      assignedTeamId: res.teamId,
      nextPlayers: normalizePlayersForPersistence(res.players),
      nowIso
    };
  }

  if (!player.revealed) {
    return {
      kind: 'reveal_only',
      assignedTeamId: player.teamId,
      nowIso
    };
  }

  return {
    kind: 'noop',
    assignedTeamId: player.teamId,
    nowIso
  };
}
