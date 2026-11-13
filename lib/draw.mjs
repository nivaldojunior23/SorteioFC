import { randomInt } from 'node:crypto';

export const DEFAULT_GK_PER_TEAM = 1;
export const DEFAULT_OUTFIELD_PER_TEAM = 6;

export const VEST_PALETTE = [
  { id: 'ouro', name: 'Time 1', shortName: 'Time 1', color: '#EAB308', textColor: '#0A1E15', borderColor: '#FDE047' },
  { id: 'preto', name: 'Time 2', shortName: 'Time 2', color: '#1C221F', textColor: '#F5F2E8', borderColor: '#717E77' },
  { id: 'branco', name: 'Time 3', shortName: 'Time 3', color: '#F5F2E8', textColor: '#0A1E15', borderColor: '#D6D1C2' },
  { id: 'azul', name: 'Time 4', shortName: 'Time 4', color: '#2563EB', textColor: '#F5F2E8', borderColor: '#60A5FA' },
  { id: 'vermelho', name: 'Time 5', shortName: 'Time 5', color: '#DC2626', textColor: '#F5F2E8', borderColor: '#F87171' },
  { id: 'verde', name: 'Time 6', shortName: 'Time 6', color: '#10B981', textColor: '#071A12', borderColor: '#34D399' }
];

const COLOR_KEYWORD_MAP = [
  { regex: /\b(ouro|amarel[oa]|dourad[oa])\b/i, preset: VEST_PALETTE[0] },
  { regex: /\b(pret[oa])\b/i, preset: VEST_PALETTE[1] },
  { regex: /\b(branc[oa])\b/i, preset: VEST_PALETTE[2] },
  { regex: /\b(azul)\b/i, preset: VEST_PALETTE[3] },
  { regex: /\b(vermelh[oa])\b/i, preset: VEST_PALETTE[4] },
  { regex: /\b(verde)\b/i, preset: VEST_PALETTE[5] }
];

/**
 * Normalizes legacy "Colete ..." names to "Time 1, Time 2, Time 3"
 * and enforces the default TiraTime formation of 6 na linha + 1 no gol.
 */
export function normalizeTeams(teams = []) {
  return teams.map((team, idx) => {
    const fallback = VEST_PALETTE[idx % VEST_PALETTE.length];
    const defaultLabel = `Time ${idx + 1}`;
    const isLegacyColete = !team.name || /^Colete\b/i.test(String(team.name).trim());
    const resolvedName = isLegacyColete ? defaultLabel : team.name;
    const resolvedShortName =
      isLegacyColete || !team.shortName || /^(Ouro|Preto|Branco|Azul|Vermelho|Verde)$/i.test(String(team.shortName).trim())
        ? defaultLabel
        : team.shortName;

    const label = `${resolvedName} ${resolvedShortName}`;
    const matched = COLOR_KEYWORD_MAP.find((entry) => entry.regex.test(label))?.preset;

    const rawOutfieldCap = Number(team.outfieldCap);
    const resolvedOutfieldCap =
      Number.isFinite(rawOutfieldCap) && rawOutfieldCap >= 3 && rawOutfieldCap <= 11
        ? Math.round(rawOutfieldCap)
        : DEFAULT_OUTFIELD_PER_TEAM;

    return {
      ...team,
      name: resolvedName,
      shortName: resolvedShortName,
      color: matched ? matched.color : team.color || fallback.color,
      textColor: matched ? matched.textColor : team.textColor || fallback.textColor,
      borderColor: matched ? matched.borderColor : team.borderColor || fallback.borderColor,
      gkCap: Math.max(DEFAULT_GK_PER_TEAM, Number(team.gkCap) || DEFAULT_GK_PER_TEAM),
      outfieldCap: resolvedOutfieldCap
    };
  });
}

export function buildDefaultTeams(count = 3, outfieldPerTeam = DEFAULT_OUTFIELD_PER_TEAM) {
  const safeCount = Math.min(4, Math.max(2, Number(count) || 3));
  const safeOutfield = Math.min(11, Math.max(3, Number(outfieldPerTeam) || DEFAULT_OUTFIELD_PER_TEAM));
  return VEST_PALETTE.slice(0, safeCount).map((preset) => ({
    ...preset,
    gkCap: DEFAULT_GK_PER_TEAM,
    outfieldCap: safeOutfield
  }));
}

export function cryptoShuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function distributeCaps(totalCount, teamCount) {
  const base = Math.floor(totalCount / teamCount);
  const remainder = totalCount % teamCount;
  const caps = Array.from({ length: teamCount }, (_, i) => base + (i < remainder ? 1 : 0));
  return cryptoShuffle(caps);
}

/**
 * Computes balanced target capacities for each team.
 * Default pelada rule: 6 na linha + 1 no gol (7 players per team).
 */
export function computeTeamCaps({ players, teams, includeDoubts = false }) {
  const normalized = normalizeTeams(teams);
  const eligible = players.filter(
    (p) => p.status === 'confirmed' || (includeDoubts && p.status === 'doubt')
  );
  const gkCount = eligible.filter((p) => p.role === 'gk').length;
  const gkCaps = distributeCaps(gkCount, normalized.length);

  return normalized.map((team, idx) => ({
    ...team,
    gkCap: Math.max(DEFAULT_GK_PER_TEAM, gkCaps[idx]),
    outfieldCap: team.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM
  }));
}

/**
 * Runs a complete balanced draw across all eligible players.
 * Keeps `revealed = false` when in `closed_reveal` mode so each player
 * experiences the reveal individually on their phone.
 */
export function runFullDraw({
  players,
  teams,
  includeDoubts = false,
  balanceGk = true,
  revealImmediately = false
}) {
  const updatedTeams = computeTeamCaps({ players, teams, includeDoubts });
  const teamOrderForGk = cryptoShuffle(updatedTeams.map((t) => t.id));
  const teamOrderForOutfield = cryptoShuffle(updatedTeams.map((t) => t.id));

  const eligibleIds = new Set(
    players
      .filter((p) => p.status === 'confirmed' || (includeDoubts && p.status === 'doubt'))
      .map((p) => p.id)
  );

  const gks = cryptoShuffle(players.filter((p) => eligibleIds.has(p.id) && p.role === 'gk'));
  const outfield = cryptoShuffle(players.filter((p) => eligibleIds.has(p.id) && p.role === 'outfield'));

  const assignments = new Map();

  if (balanceGk) {
    // Goalkeepers slot pool
    const maxGkCap = Math.max(...updatedTeams.map((t) => t.gkCap || DEFAULT_GK_PER_TEAM));
    const gkSlots = [];
    for (let slot = 0; slot < maxGkCap; slot++) {
      for (const teamId of teamOrderForGk) {
        const team = updatedTeams.find((t) => t.id === teamId);
        const cap = team?.gkCap || DEFAULT_GK_PER_TEAM;
        if (slot < cap) {
          gkSlots.push(teamId);
        }
      }
    }
    gks.forEach((player, index) => {
      if (index < gkSlots.length) {
        assignments.set(player.id, gkSlots[index]);
      } else {
        assignments.set(player.id, null);
      }
    });

    // Outfield slot pool strictly respecting team.outfieldCap
    const maxOutfieldCap = Math.max(
      ...updatedTeams.map((t) => t.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM)
    );
    const outfieldSlots = [];
    for (let slot = 0; slot < maxOutfieldCap; slot++) {
      for (const teamId of teamOrderForOutfield) {
        const team = updatedTeams.find((t) => t.id === teamId);
        const cap = team?.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM;
        if (slot < cap) {
          outfieldSlots.push(teamId);
        }
      }
    }
    outfield.forEach((player, index) => {
      if (index < outfieldSlots.length) {
        assignments.set(player.id, outfieldSlots[index]);
      } else {
        // Exceeds line capacity across all teams! Stays on waiting list / substitutes
        assignments.set(player.id, null);
      }
    });
  } else {
    const maxTotalCap = Math.max(
      ...updatedTeams.map(
        (t) => (t.gkCap || DEFAULT_GK_PER_TEAM) + (t.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM)
      )
    );
    const allSlots = [];
    for (let slot = 0; slot < maxTotalCap; slot++) {
      for (const teamId of teamOrderForOutfield) {
        const team = updatedTeams.find((t) => t.id === teamId);
        const cap = (team?.gkCap || DEFAULT_GK_PER_TEAM) + (team?.outfieldCap || DEFAULT_OUTFIELD_PER_TEAM);
        if (slot < cap) {
          allSlots.push(teamId);
        }
      }
    }
    const combined = cryptoShuffle([...gks, ...outfield]);
    combined.forEach((player, index) => {
      if (index < allSlots.length) {
        assignments.set(player.id, allSlots[index]);
      } else {
        assignments.set(player.id, null);
      }
    });
  }

  const nowIso = new Date().toISOString();
  const nextPlayers = players.map((p) => {
    if (!eligibleIds.has(p.id)) {
      return {
        ...p,
        teamId: null,
        revealed: false,
        revealedAt: null
      };
    }
    return {
      ...p,
      teamId: assignments.get(p.id),
      revealed: Boolean(revealImmediately),
      revealedAt: revealImmediately ? nowIso : null
    };
  });

  return { teams: updatedTeams, players: nextPlayers };
}

/**
 * Prepares a clean Live Urn session: clears current assignments and stores
 * balanced target capacities per team so arriving players draw one-by-one.
 */
export function prepareLiveUrn({ players, teams, includeDoubts = false }) {
  const updatedTeams = computeTeamCaps({ players, teams, includeDoubts });
  const nextPlayers = players.map((p) => ({
    ...p,
    teamId: null,
    revealed: false,
    revealedAt: null,
    arrived: false
  }));
  return { teams: updatedTeams, players: nextPlayers };
}

/**
 * Draws a single player into the fairest available team slot in a Live Urn
 * (or draws a late-confirmed player into an existing Closed Draw).
 */
export function assignSinglePlayerFromUrn({
  playerId,
  players,
  teams,
  balanceGk = true
}) {
  const targetPlayer = players.find((p) => p.id === playerId);
  if (!targetPlayer) {
    throw new Error('Jogador não encontrado.');
  }

  // If already assigned, simply mark revealed!
  if (targetPlayer.teamId) {
    const nowIso = new Date().toISOString();
    const nextPlayers = players.map((p) =>
      p.id === playerId
        ? { ...p, revealed: true, revealedAt: p.revealedAt ?? nowIso, arrived: true }
        : p
    );
    return {
      teamId: targetPlayer.teamId,
      players: nextPlayers
    };
  }

  const roleKey = targetPlayer.role === 'gk' && balanceGk ? 'gk' : 'outfield';
  const countForTeam = (teamId) =>
    players.filter(
      (p) =>
        p.teamId === teamId &&
        (balanceGk ? (roleKey === 'gk' ? p.role === 'gk' : p.role !== 'gk') : true)
    ).length;

  // Real Urn without replacement: each remaining slot in a team is 1 ball in the urn.
  // To avoid lopsided teams if someone on the list is absent, teams that are already 2+ players
  // ahead of the smallest team pause until others catch up.
  const allTeamCounts = teams.map((team) => {
    const cap =
      roleKey === 'gk'
        ? (team.gkCap ?? DEFAULT_GK_PER_TEAM)
        : (team.outfieldCap ?? DEFAULT_OUTFIELD_PER_TEAM);
    const current = countForTeam(team.id);
    return { id: team.id, current, cap, remaining: cap - current };
  });
  const minCurrentAll = Math.min(...allTeamCounts.map((t) => t.current));
  const availableWithSpace = allTeamCounts.filter((t) => t.remaining > 0);

  let chosenTeamId;
  if (availableWithSpace.length > 0) {
    let eligibleTeams = availableWithSpace.filter((t) => {
      if (t.current - minCurrentAll >= 2) return false;
      if (t.current + 1 >= t.cap && minCurrentAll < t.cap - 1) return false;
      return true;
    });
    if (eligibleTeams.length === 0) {
      const minAvail = Math.min(...availableWithSpace.map((t) => t.current));
      eligibleTeams = availableWithSpace.filter((t) => t.current === minAvail);
    }
    const pool = [];
    for (const t of eligibleTeams) {
      for (let i = 0; i < t.remaining; i += 1) {
        pool.push(t.id);
      }
    }
    chosenTeamId = pool[randomInt(pool.length)];
  } else {
    // Overflow fallback (e.g. a late player added after caps were set): pick among least-populated teams
    const counts = teams.map((t) => ({
      id: t.id,
      roleCount: countForTeam(t.id),
      totalCount: players.filter((p) => p.teamId === t.id).length
    }));
    const minRole = Math.min(...counts.map((c) => c.roleCount));
    const roleCandidates = counts.filter((c) => c.roleCount === minRole);
    const minTotal = Math.min(...roleCandidates.map((c) => c.totalCount));
    const finalCandidates = roleCandidates.filter((c) => c.totalCount === minTotal);
    chosenTeamId = finalCandidates[randomInt(finalCandidates.length)].id;
  }

  const nowIso = new Date().toISOString();
  const nextPlayers = players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          status: p.status === 'doubt' ? 'confirmed' : p.status,
          teamId: chosenTeamId,
          revealed: true,
          revealedAt: nowIso,
          arrived: true
        }
      : p
  );

  return {
    teamId: chosenTeamId,
    players: nextPlayers
  };
}

/**
 * Formats teams cleanly for pasting back into the WhatsApp group.
 */
export function formatTeamsForWhatsApp(match) {
  const { meta, teams, players, openSlots } = match;
  const lines = [
    `🏆 *TIMES — ${match.groupName.toUpperCase()}*`,
    `📅 ${meta.dateLabel} · 🕘 ${meta.timeLabel}${meta.feeLabel ? ` · 💸 ${meta.feeLabel}` : ''}`,
    ''
  ];

  for (const team of teams) {
    const roster = players
      .filter((p) => p.teamId === team.id && (match.revealAllPublic || p.revealed))
      .sort((a, b) => (a.role === b.role ? a.sortOrder - b.sortOrder : a.role === 'gk' ? -1 : 1));

    const hiddenCount = players.filter(
      (p) => p.teamId === team.id && !match.revealAllPublic && !p.revealed
    ).length;

    lines.push(`*${team.name.toUpperCase()}* (${roster.length + hiddenCount})`);
    if (roster.length === 0 && hiddenCount === 0) {
      lines.push('  _Nenhum jogador sorteado ainda_');
    } else {
      roster.forEach((p, idx) => {
        const prefix = p.role === 'gk' ? '🧤' : `${idx + 1}.`;
        const tags = [p.isGuest ? 'conv.' : '', p.status === 'doubt' ? 'dúvida' : '']
          .filter(Boolean)
          .join(', ');
        lines.push(`${prefix} ${p.name}${tags ? ` (${tags})` : ''}`);
      });
      if (hiddenCount > 0) {
        lines.push(`🔒 +${hiddenCount} aguardando abrir no sistema`);
      }
    }
    lines.push('');
  }

  const doubts = players.filter((p) => p.status === 'doubt' && !p.teamId);
  if (doubts.length > 0) {
    lines.push(`⚠️ *Dúvidas:* ${doubts.map((d) => d.name).join(', ')}`);
  }
  const waitingList = players.filter(
    (p) => (p.status === 'confirmed' || p.status === 'waiting') && !p.teamId
  );
  if (waitingList.length > 0) {
    lines.push(`🔄 *Próximos da Fila / Suplentes:* ${waitingList.map((p) => `#${p.listNumber ?? '•'} ${p.name}`).join(', ')}`);
  }
  if (openSlots?.length > 0) {
    lines.push(`📌 *Vagas em aberto:* ${openSlots.map((s) => `#${s.listNumber}`).join(', ')}`);
  }

  return lines.join('\n').trim();
}
