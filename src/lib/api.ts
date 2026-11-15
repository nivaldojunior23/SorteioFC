import type { MatchState, MatchSummary, ParsePreviewResult, RevealResponse } from '../types';

export interface AdminAuth {
  pin?: string;
  token?: string;
}

function authHeaders(auth?: AdminAuth): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) headers['x-admin-token'] = auth.token;
  if (auth?.pin) headers['x-admin-pin'] = auth.pin;
  return headers;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }
  return data as T;
}

/** Public summaries only for rooms this browser already knows (no global listing). */
export async function fetchMatches(slugs: string[]): Promise<MatchSummary[]> {
  if (slugs.length === 0) return [];
  const data = await requestJson<{ matches: MatchSummary[] }>(
    `/api/matches?slugs=${encodeURIComponent(slugs.join(','))}`
  );
  return data.matches;
}

export async function fetchMatch(slug: string, auth?: AdminAuth): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(`/api/matches/${encodeURIComponent(slug)}`, {
    headers: authHeaders(auth)
  });
  return data.match;
}

export async function verifyAdminAuth(slug: string, payload: { pin?: string; token?: string }) {
  return requestJson<{ match: MatchState; adminToken: string }>(
    `/api/matches/${encodeURIComponent(slug)}/auth`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
}

export async function createMatch(payload: {
  groupName: string;
  adminPin: string;
  rawList?: string;
  teamCount?: number;
  drawMode?: 'closed_reveal' | 'live_urn';
  dateLabel?: string;
  timeLabel?: string;
  feeAmount?: string | number;
}): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>('/api/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return data.match;
}

export async function previewWhatsAppParse(rawList: string): Promise<ParsePreviewResult> {
  return requestJson<ParsePreviewResult>('/api/parse-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawList })
  });
}

export async function importMatchList(
  slug: string,
  rawList: string,
  autoDraw: boolean,
  auth?: AdminAuth
): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(
    `/api/matches/${encodeURIComponent(slug)}/import`,
    {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify({ rawList, autoDraw })
    }
  );
  return data.match;
}

export async function updateMatchSettings(
  slug: string,
  patch: Record<string, unknown>,
  auth?: AdminAuth
): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(
    `/api/matches/${encodeURIComponent(slug)}/settings`,
    {
      method: 'PATCH',
      headers: authHeaders(auth),
      body: JSON.stringify(patch)
    }
  );
  return data.match;
}

export async function executeDraw(
  slug: string,
  action: 'run_full_draw' | 'draw_and_reveal' | 'open_live_urn' | 'reveal_all' | 'hide_all' | 'reset_week',
  auth?: AdminAuth
): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(
    `/api/matches/${encodeURIComponent(slug)}/draw`,
    {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify({ action })
    }
  );
  return data.match;
}

export async function addPlayer(
  slug: string,
  payload: Record<string, unknown>,
  auth?: AdminAuth
): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(
    `/api/matches/${encodeURIComponent(slug)}/players`,
    {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify(payload)
    }
  );
  return data.match;
}

export async function updatePlayer(
  slug: string,
  playerId: string,
  patch: Record<string, unknown>,
  auth?: AdminAuth
): Promise<MatchState> {
  const data = await requestJson<{ match: MatchState }>(
    `/api/matches/${encodeURIComponent(slug)}/players/${encodeURIComponent(playerId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(auth),
      body: JSON.stringify(patch)
    }
  );
  return data.match;
}

export async function revealPlayer(slug: string, playerId: string): Promise<RevealResponse> {
  return requestJson<RevealResponse>(
    `/api/matches/${encodeURIComponent(slug)}/players/${encodeURIComponent(playerId)}/reveal`,
    { method: 'POST' }
  );
}

export async function fetchWhatsAppExport(slug: string, auth?: AdminAuth): Promise<string> {
  const data = await requestJson<{ text: string }>(
    `/api/matches/${encodeURIComponent(slug)}/whatsapp-export`,
    { headers: authHeaders(auth) }
  );
  return data.text;
}

export async function deleteMatch(slug: string, auth?: AdminAuth): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/matches/${encodeURIComponent(slug)}`,
    {
      method: 'DELETE',
      headers: authHeaders(auth)
    }
  );
}

// Lightweight Web Audio API cues (zero external media files, muted safely on error)
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playDrawSpinCue(enabled: boolean, reducedMotion = false) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const ticks = reducedMotion
      ? [0.02, 0.16]
      : [0.05, 0.17, 0.30, 0.45, 0.62, 0.81, 1.03, 1.28, 1.56, 1.88, 2.24, 2.65];
    ticks.forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320 + idx * 32, now + offset);
      gain.gain.setValueAtTime(0.06, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.09);
    });
  } catch {
    // Ignore audio context issues silently
  }
}

export function playRevealSuccessCue(enabled: boolean) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 - E5 - G5 - C6 stadium chord
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.08, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.45);
    });
  } catch {
    // Ignore audio context issues silently
  }
}
