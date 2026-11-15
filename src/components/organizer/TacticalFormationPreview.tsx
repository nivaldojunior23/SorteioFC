import { AlertTriangle, Check, Users } from 'lucide-react';
import type { Player, TeamConfig } from '../../types';
import { FORMATION_LAYOUTS, VestBadge, getInitials } from '../TiraTimeCrest';

interface TacticalFormationPreviewProps {
  teams: TeamConfig[];
  outfieldCap: number;
  balanceGk: boolean;
  players: Player[];
  eligibleCount: number;
}

/** Live mini-pitch schematic showing vacancies and assigned players per team. */
export function TacticalFormationPreview({
  teams,
  outfieldCap,
  balanceGk,
  players,
  eligibleCount
}: TacticalFormationPreviewProps) {
  const coords = FORMATION_LAYOUTS[outfieldCap] || FORMATION_LAYOUTS[6];
  const playersPerTeam = outfieldCap + 1;
  const totalSlots = teams.length * playersPerTeam;
  const diffSlots = totalSlots - eligibleCount;

  const gridClass =
    teams.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : teams.length === 4
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-3">
      {/* Compact Capacity & Balance Bar */}
      <div className="pitch-inset rounded-xl border border-[var(--chalk-line)] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="text-[var(--ink-sage)] leading-relaxed">
          <strong className="text-[var(--ink-chalk)] tabular-nums">
            {teams.length} times × {playersPerTeam} vagas = {totalSlots} no sorteio
          </strong>
          <span className="text-[var(--ink-muted)]">
            {' · '}
            {balanceGk ? `1 no gol + ${outfieldCap} na linha` : 'todos sorteados juntos'}
          </span>
        </div>

        <div className="shrink-0">
          {players.length === 0 ? (
            <span className="text-[var(--ink-muted)] font-medium">
              Aguardando lista ({totalSlots} vagas)
            </span>
          ) : diffSlots === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold tabular-nums">
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Elenco exato ({eligibleCount}/{totalSlots})</span>
            </span>
          ) : diffSlots > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold tabular-nums">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Faltam {diffSlots} atletas ({eligibleCount}/{totalSlots})</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold tabular-nums">
              <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{eligibleCount} atletas (+{Math.abs(diffSlots)} distribuídos nos times)</span>
            </span>
          )}
        </div>
      </div>

      {/* Tactically positioned pitch for each team */}
      <div className={`grid ${gridClass} gap-3`}>
        {teams.map((team, tIdx) => {
          const teamPlayers = players.filter((p) => p.teamId === team.id);
          const explicitGks = teamPlayers.filter((p) => p.role === 'gk');
          const explicitOutfields = teamPlayers.filter((p) => p.role !== 'gk');
          const gkPlayer =
            explicitGks[0] ??
            (!balanceGk || explicitOutfields.length > outfieldCap
              ? explicitOutfields[0]
              : undefined);
          const outfields =
            explicitGks.length > 0
              ? [...explicitOutfields, ...explicitGks.slice(1)]
              : gkPlayer
                ? explicitOutfields.slice(1)
                : explicitOutfields;

          return (
            <div
              key={team.id || tIdx}
              className="rounded-xl border border-[var(--chalk-line)] bg-[#06160F] p-3 space-y-2.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <VestBadge team={team} size="sm" />
                  <span className="text-sm font-bold text-[var(--ink-chalk)] truncate">
                    {team.name}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[var(--ink-sage)] tabular-nums shrink-0">
                  {teamPlayers.length > 0 ? `${teamPlayers.length} no time` : `${playersPerTeam} vagas`}
                </span>
              </div>

              {/* Pitch Preview SVG */}
              <div className="relative">
                <svg
                  viewBox="0 0 240 136"
                  className="w-full h-28 sm:h-32 rounded-lg bg-[#081F15] border border-[rgba(247,244,235,0.14)] shadow-inner"
                  role="img"
                  aria-label={`Esquema tático do ${team.name}: 1 no gol e ${outfieldCap} na linha`}
                >
                  {/* Subtle mowed grass bands */}
                  <rect x="0" y="0" width="40" height="136" fill="rgba(247,244,235,0.02)" />
                  <rect x="80" y="0" width="40" height="136" fill="rgba(247,244,235,0.02)" />
                  <rect x="160" y="0" width="40" height="136" fill="rgba(247,244,235,0.02)" />

                  {/* Outer pitch boundary */}
                  <rect
                    x="8"
                    y="8"
                    width="224"
                    height="120"
                    rx="4"
                    fill="none"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />
                  {/* Halfway line on right */}
                  <line
                    x1="198"
                    y1="8"
                    x2="198"
                    y2="128"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />
                  {/* Center circle & spot */}
                  <circle
                    cx="198"
                    cy="68"
                    r="28"
                    fill="none"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />
                  <circle cx="198" cy="68" r="2" fill="rgba(247,244,235,0.32)" />
                  {/* Penalty area (left) */}
                  <rect
                    x="8"
                    y="24"
                    width="64"
                    height="88"
                    fill="none"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />
                  {/* Six-yard box (left) */}
                  <rect
                    x="8"
                    y="44"
                    width="28"
                    height="48"
                    fill="none"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />
                  {/* Penalty spot */}
                  <circle cx="52" cy="68" r="2" fill="rgba(247,244,235,0.32)" />
                  {/* Penalty arc (meia-lua) */}
                  <path
                    d="M 72 46 A 26 26 0 0 1 72 90"
                    fill="none"
                    stroke="rgba(247,244,235,0.22)"
                    strokeWidth="1.5"
                  />

                  {/* Goalkeeper circle (Gold, inside six-yard box on left) */}
                  {gkPlayer ? (
                    <g>
                      <circle cx="22" cy="68" r="10.5" fill="#EAB308" stroke="#06160F" strokeWidth="2" />
                      <text x="22" y="71.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#06160F">
                        {getInitials(gkPlayer.name)}
                      </text>
                    </g>
                  ) : (
                    <g>
                      <circle cx="22" cy="68" r="10" fill="#EAB308" stroke="#06160F" strokeWidth="1.5" />
                      <text x="22" y="71" textAnchor="middle" fontSize="7" fontWeight="800" fill="#06160F">
                        GOL
                      </text>
                    </g>
                  )}

                  {/* Outfield slots based on selected line cap */}
                  {Array.from({ length: outfieldCap }).map((_, slotIdx) => {
                    const [cx, cy] = coords[slotIdx] || [
                      50 + (slotIdx % 3) * 70,
                      56 + Math.floor(slotIdx / 3) * 26,
                      `L${slotIdx + 1}`
                    ];
                    const player = outfields[slotIdx];

                    if (player) {
                      return (
                        <g key={player.id}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r="10"
                            fill={team.color}
                            stroke={team.borderColor}
                            strokeWidth="2"
                          />
                          <text
                            x={cx}
                            y={cy + 3}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="700"
                            fill={team.textColor}
                          >
                            {getInitials(player.name)}
                          </text>
                        </g>
                      );
                    }

                    return (
                      <g key={`slot-${slotIdx}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r="9.5"
                          fill="#0B2218"
                          stroke={team.borderColor}
                          strokeDasharray="2.5 2.5"
                          strokeWidth="1.2"
                        />
                        <text
                          x={cx}
                          y={cy + 2.8}
                          textAnchor="middle"
                          fontSize="7"
                          fontWeight="700"
                          fill="rgba(247,244,235,0.85)"
                        >
                          L{slotIdx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Compact bottom summary */}
              <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)] pt-0.5 tabular-nums">
                <span>1 Gol + {outfieldCap} Linha</span>
                <span className="font-semibold text-[var(--ink-sage)]">{playersPerTeam} atletas</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
