export type PlayerRole = 'outfield' | 'gk';
export type PlayerStatus = 'confirmed' | 'doubt' | 'waiting' | 'out';
export type DrawMode = 'closed_reveal' | 'live_urn';

export interface TeamConfig {
  id: string;
  name: string;
  shortName: string;
  color: string;
  textColor: string;
  borderColor: string;
  gkCap?: number;
  outfieldCap?: number;
}

export interface Player {
  id: string;
  listNumber: number | null;
  name: string;
  role: PlayerRole;
  status: PlayerStatus;
  isGuest: boolean;
  note: string;
  paid: boolean;
  arrived: boolean;
  teamId: string | null;
  revealed: boolean;
  revealedAt: string | null;
  sortOrder: number;
}

export interface MatchMeta {
  title: string;
  dateLabel: string;
  timeLabel: string;
  arrivalNote: string;
  feeLabel: string;
  feeAmount: number;
}

export interface OpenSlot {
  listNumber: number;
}

export interface MatchState {
  id: string;
  slug: string;
  groupName: string;
  meta: MatchMeta;
  rawList: string;
  drawMode: DrawMode;
  drawStatus: 'draft' | 'drawn' | 'live';
  revealAllPublic: boolean;
  includeDoubts: boolean;
  balanceGk: boolean;
  lockOnePerDevice: boolean;
  teams: TeamConfig[];
  openSlots: OpenSlot[];
  warnings: string[];
  players: Player[];
  isAdmin: boolean;
  adminPin?: string;
  adminToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchSummary {
  slug: string;
  groupName: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  feeLabel?: string;
  playerCount?: number;
  drawMode: DrawMode;
  drawStatus: string;
  updatedAt: string;
}

export interface ParsePreviewResult {
  meta: MatchMeta;
  players: Player[];
  openSlots: OpenSlot[];
  warnings: string[];
  summary: {
    totalPlayers: number;
    outfieldCount: number;
    gkCount: number;
    doubtCount: number;
    openSlotCount: number;
    suggestedTeams: number;
  };
}

export interface RevealResponse {
  player: Player;
  team: TeamConfig;
  teammates: Player[];
  match: MatchState;
}
