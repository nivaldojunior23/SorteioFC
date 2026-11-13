import type { Player, TeamConfig } from '../types';

export function TiraTimeCrest({ className = 'w-11 h-11' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Escudo TiraTime"
    >
      <path
        fill="#0A2419"
        d="M 128 20 L 212 42.5 L 212 128 C 212 182 174 218 128 236 C 82 218 44 182 44 128 L 44 42.5 Z"
      />
      <path
        fill="#EAB308"
        fillRule="evenodd"
        d="M 128 16 L 218 40.1 L 218 128 C 218 184 178 221 128 240 C 78 221 38 184 38 128 L 38 40.1 Z M 128 32 L 54 51.8 L 54 128 C 54 174 88 204 128 221 C 168 204 202 174 202 128 L 202 51.8 Z"
      />
      <path
        fill="#F5F2E8"
        fillRule="evenodd"
        d="M 128 62 A 34 34 0 1 1 127.9 62 Z M 128 81 L 142.3 91.4 L 136.8 108.1 L 119.2 108.1 L 113.7 91.4 Z"
      />
      <path
        fill="#0A2419"
        d="M 125.5 61 L 130.5 61 L 130.5 82 L 125.5 82 Z M 141.5 89.0 L 160.5 82.8 L 162.1 87.6 L 143.1 93.8 Z M 138.8 106.7 L 150.6 122.9 L 146.6 125.8 L 134.8 109.6 Z M 117.2 106.7 L 105.4 122.9 L 109.4 125.8 L 121.2 109.6 Z M 114.5 89.0 L 95.5 82.8 L 93.9 87.6 L 112.9 93.8 Z"
      />
      <path
        fill="#EAB308"
        d="M 72 138 C 94 156 162 156 184 138 L 172 164 C 152 178 104 178 84 164 Z"
      />
      <path
        fill="#F5F2E8"
        d="M 92 176 L 128 196.8 L 164 176 L 164 188 L 128 208.8 L 92 188 Z"
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
  hiddenCount = 0
}: {
  team: TeamConfig;
  players: Player[];
  hiddenCount?: number;
}) {
  const gks = players.filter((p) => p.role === 'gk');
  const outfields = players.filter((p) => p.role !== 'gk');

  const targetOutfield = team.outfieldCap ?? 6;
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

      {/* Goalkeeper marker (left goal box) */}
      {gks.length > 0 ? (
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
            {getInitials(gks[0].name)}
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
