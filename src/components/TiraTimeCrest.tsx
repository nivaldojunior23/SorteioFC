import type { Player, TeamConfig } from '../types';

export function TiraTimeCrest({ className = 'w-11 h-11' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Logo TiraTime"
    >
      {/* Top-left spinning urn arc (Trophy Gold) */}
      <path
        fill="#EAB308"
        d="M 32.7 183 A 110 110 0 0 1 183 32.7 L 172 51.8 A 88 88 0 0 0 51.8 172 Z"
      />
      {/* Bottom-right spinning urn arc (Pitch Emerald) */}
      <path
        fill="#22C55E"
        d="M 223.3 73 A 110 110 0 0 1 73 223.3 L 84 204.2 A 88 88 0 0 0 204.2 84 Z"
      />
      {/* Classic geometric football */}
      <circle cx="128" cy="128" r="68" fill="#F5F2E8" />
      <path
        fill="#071A12"
        fillRule="evenodd"
        d="M 128 62.5 A 65.5 65.5 0 1 1 127.9 62.5 Z M 128 73.5 A 54.5 54.5 0 1 0 128.1 73.5 Z"
      />
      <path
        fill="#071A12"
        d="M 123.5 113.4 L 132.5 113.4 L 132.5 84.6 L 136.6 84.6 L 147 72.5 L 128 68 L 109 72.5 L 119.5 84.6 L 123.5 84.6 Z"
      />
      <path
        fill="#071A12"
        d="M 140.5 119.2 L 143.3 127.8 L 170.6 118.9 L 171.9 122.7 L 186.7 128.9 L 185.1 109.5 L 174.9 92.8 L 166.6 106.5 L 167.9 110.3 Z"
      />
      <path
        fill="#071A12"
        d="M 140.2 137.2 L 133 142.5 L 149.8 165.7 L 146.6 168.1 L 145.3 184.1 L 163.3 176.5 L 176 161.7 L 160.4 158.1 L 157.1 160.4 Z"
      />
      <path
        fill="#071A12"
        d="M 123 142.5 L 115.8 137.2 L 98.9 160.4 L 95.6 158.1 L 80 161.7 L 92.7 176.5 L 110.7 184.1 L 109.4 168.1 L 106.2 165.7 Z"
      />
      <path
        fill="#071A12"
        d="M 112.7 127.8 L 115.5 119.2 L 88.1 110.3 L 89.4 106.5 L 81.1 92.8 L 70.9 109.5 L 69.3 128.9 L 84.1 122.7 L 85.4 118.9 Z"
      />
      <polygon
        fill="#071A12"
        points="128,106.5 148.4,121.4 140.6,145.4 115.4,145.4 107.6,121.4"
      />
    </svg>
  );
}

export function VestBadge({
  team,
  size = 'md'
}: {
  team: Pick<TeamConfig, 'color' | 'borderColor' | 'shortName'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-5 h-5' : 'w-8 h-8';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={dims}
      aria-hidden="true"
    >
      <path
        d="M18 10 L24 10 C25.5 15 38.5 15 40 10 L46 10 L54 20 L48 27 L44 24 L44 54 L20 54 L20 24 L16 27 L10 20 Z"
        fill={team.color}
        stroke={team.borderColor}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function getInitials(name: string) {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

/**
 * Geometric tactical horizontal half-pitch (left-to-right: goal on left, midfield on right)
 * matching classic tactical board proportions (GK at x=22, y=68).
 */
export const FORMATION_LAYOUTS: Record<number, Array<[number, number, string]>> = {
  4: [
    [90, 44, 'ZAG E'],
    [90, 92, 'ZAG D'],
    [176, 44, 'ATA E'],
    [176, 92, 'ATA D']
  ],
  5: [
    [88, 42, 'ZAG E'],
    [88, 94, 'ZAG D'],
    [134, 68, 'MEI'],
    [180, 34, 'ATA E'],
    [180, 102, 'ATA D']
  ],
  6: [
    [90, 32, 'ZAG E'],
    [90, 68, 'ZAG C'],
    [90, 104, 'ZAG D'],
    [180, 22, 'ALA E'],
    [180, 68, 'MEI C'],
    [180, 114, 'ALA D']
  ],
  7: [
    [86, 32, 'ZAG E'],
    [86, 68, 'ZAG C'],
    [86, 104, 'ZAG D'],
    [136, 46, 'MEI E'],
    [136, 90, 'MEI D'],
    [184, 34, 'ATA E'],
    [184, 102, 'ATA D']
  ],
  8: [
    [84, 30, 'ZAG E'],
    [84, 68, 'ZAG C'],
    [84, 106, 'ZAG D'],
    [136, 28, 'MEI E'],
    [136, 68, 'MEI C'],
    [136, 108, 'MEI D'],
    [184, 44, 'ATA E'],
    [184, 92, 'ATA D']
  ],
  10: [
    [82, 22, 'LE'],
    [82, 52, 'ZAG E'],
    [82, 84, 'ZAG D'],
    [82, 114, 'LD'],
    [134, 32, 'VOL E'],
    [134, 68, 'MEI C'],
    [134, 104, 'VOL D'],
    [184, 24, 'ATA E'],
    [184, 68, 'ATA C'],
    [184, 112, 'ATA D']
  ]
};

export function MiniPitchSvg({
  team,
  players,
  hiddenCount = 0,
  balanceGk = true
}: {
  team: TeamConfig;
  players: Player[];
  hiddenCount?: number;
  balanceGk?: boolean;
}) {
  const targetOutfield = team.outfieldCap ?? 6;
  const explicitGks = players.filter((p) => p.role === 'gk');
  const explicitOutfields = players.filter((p) => p.role !== 'gk');
  const gkPlayer =
    explicitGks[0] ??
    (!balanceGk || explicitOutfields.length > targetOutfield
      ? explicitOutfields[0]
      : undefined);
  const outfields =
    explicitGks.length > 0
      ? [...explicitOutfields, ...explicitGks.slice(1)]
      : gkPlayer
        ? explicitOutfields.slice(1)
        : explicitOutfields;

  const layout = FORMATION_LAYOUTS[targetOutfield] || FORMATION_LAYOUTS[6];
  const slots: Array<[number, number]> = layout.map(([x, y]) => [x, y]);
  const totalOutfieldTokens = Math.max(targetOutfield, outfields.length + hiddenCount);

  return (
    <svg
      viewBox="0 0 240 136"
      className="w-full h-28 rounded-lg bg-[#092117] border border-[rgba(245,242,232,0.12)]"
      role="img"
      aria-label={`Posicionamento tático do ${team.name}`}
    >
      {/* Outer pitch boundary */}
      <rect
        x="8"
        y="8"
        width="224"
        height="120"
        rx="4"
        fill="none"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />
      {/* Halfway line on right */}
      <line
        x1="198"
        y1="8"
        x2="198"
        y2="128"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />
      {/* Center circle & spot */}
      <circle
        cx="198"
        cy="68"
        r="28"
        fill="none"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />
      <circle cx="198" cy="68" r="2" fill="rgba(245,242,232,0.3)" />
      {/* Penalty area (left) */}
      <rect
        x="8"
        y="24"
        width="64"
        height="88"
        fill="none"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />
      {/* Six-yard box (left) */}
      <rect
        x="8"
        y="44"
        width="28"
        height="48"
        fill="none"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />
      {/* Penalty spot */}
      <circle cx="52" cy="68" r="2" fill="rgba(245,242,232,0.3)" />
      {/* Penalty arc (meia-lua) */}
      <path
        d="M 72 46 A 26 26 0 0 1 72 90"
        fill="none"
        stroke="rgba(245,242,232,0.2)"
        strokeWidth="1.5"
      />

      {/* Goalkeeper marker (left goal box) — always 1 in goal on the pitch */}
      {gkPlayer ? (
        <g>
          <circle cx="22" cy="68" r="11" fill="#EAB308" stroke="#071A12" strokeWidth="2" />
          <text
            x="22"
            y="71.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#071A12"
          >
            {getInitials(gkPlayer.name)}
          </text>
        </g>
      ) : (
        <g opacity="0.45">
          <circle
            cx="22"
            cy="68"
            r="10"
            fill="none"
            stroke="#F5F2E8"
            strokeDasharray="3 3"
            strokeWidth="1.5"
          />
          <text x="22" y="71" textAnchor="middle" fontSize="7.5" fill="#F5F2E8">
            GOL
          </text>
        </g>
      )}

      {/* Outfield revealed tokens + sealed mystery tokens */}
      {Array.from({ length: Math.min(totalOutfieldTokens, slots.length) }).map((_, idx) => {
        const [cx, cy] = slots[idx];
        const player = outfields[idx];
        if (player) {
          return (
            <g key={player.id}>
              <circle
                cx={cx}
                cy={cy}
                r="11"
                fill={team.color}
                stroke={team.borderColor}
                strokeWidth="2"
              />
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fill={team.textColor}
              >
                {getInitials(player.name)}
              </text>
            </g>
          );
        }
        return (
          <g key={`sealed-${idx}`} opacity="0.6">
            <circle
              cx={cx}
              cy={cy}
              r="10"
              fill="#0D281D"
              stroke={team.borderColor}
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#F5F2E8">
              ?
            </text>
          </g>
        );
      })}
    </svg>
  );
}
