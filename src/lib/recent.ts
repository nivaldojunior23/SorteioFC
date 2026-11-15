/**
 * "Minhas peladas" — rooms this browser has created or joined.
 * Stored only in localStorage (no login needed).
 */
export interface RecentMatch {
  slug: string;
  groupName: string;
  isOrganizer: boolean;
  lastVisit: string;
}

const KEY = 'sorteiofc:recent';
const LEGACY_KEY = 'tiratime:recent';
const MAX_ITEMS = 20;

export function getRecentMatches(): RecentMatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw =
      window.localStorage.getItem(KEY) || window.localStorage.getItem(LEGACY_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((m) => m && typeof m.slug === 'string' && m.slug)
      : [];
  } catch {
    return [];
  }
}

export function rememberMatch(entry: { slug: string; groupName: string; isOrganizer?: boolean }) {
  const list = getRecentMatches();
  const prev = list.find((m) => m.slug === entry.slug);
  const next: RecentMatch = {
    slug: entry.slug,
    groupName: entry.groupName || prev?.groupName || entry.slug,
    isOrganizer: Boolean(entry.isOrganizer || prev?.isOrganizer),
    lastVisit: new Date().toISOString()
  };
  const updated = [next, ...list.filter((m) => m.slug !== entry.slug)].slice(0, MAX_ITEMS);
  window.localStorage.setItem(KEY, JSON.stringify(updated));
}

export function forgetMatch(slug: string) {
  const updated = getRecentMatches().filter((m) => m.slug !== slug);
  window.localStorage.setItem(KEY, JSON.stringify(updated));
  window.localStorage.removeItem(`sorteiofc:admin:${slug}`);
  window.localStorage.removeItem(`tiratime:admin:${slug}`);
  window.localStorage.removeItem(`sorteiofc:player:${slug}`);
  window.localStorage.removeItem(`tiratime:player:${slug}`);
  window.localStorage.removeItem(`sorteiofc:device-lock:${slug}`);
  window.localStorage.removeItem(`tiratime:device-lock:${slug}`);
}

export interface DeviceDrawLock {
  playerId: string;
  playerName: string;
}

export function getDeviceDrawLock(slug: string): DeviceDrawLock | null {
  try {
    const raw =
      window.localStorage.getItem(`sorteiofc:device-lock:${slug}`) ||
      window.localStorage.getItem(`tiratime:device-lock:${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.playerId === 'string') {
      return {
        playerId: parsed.playerId,
        playerName: typeof parsed.playerName === 'string' ? parsed.playerName : ''
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDeviceDrawLock(slug: string, playerId: string, playerName: string) {
  try {
    window.localStorage.setItem(
      `sorteiofc:device-lock:${slug}`,
      JSON.stringify({ playerId, playerName })
    );
  } catch {
    // ignore quota errors
  }
}

/** Accepts a room code ("pelada-do-ze-k7m2") or a full shared link ("https://.../?pelada=..."). */
export function extractRoomCode(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw) || raw.includes('?pelada=')) {
      const url = new URL(raw, window.location.origin);
      const fromQuery = url.searchParams.get('pelada');
      if (fromQuery) return fromQuery.trim().toLowerCase();
    }
  } catch {
    // not a URL, fall through
  }
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
