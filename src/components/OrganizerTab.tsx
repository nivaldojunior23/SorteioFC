import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Copy, Hash, KeyRound, Link2, Shuffle } from 'lucide-react';
import { updateMatchSettings, type AdminAuth } from '../lib/api';
import type { MatchState } from '../types';
import { DrawConfigPanel } from './organizer/DrawConfigPanel';
import { OrganizerAuthGate } from './organizer/OrganizerAuthGate';
import { RoomSettingsPanel } from './organizer/RoomSettingsPanel';
import { RosterManagerPanel } from './organizer/RosterManagerPanel';

interface OrganizerTabProps {
  match: MatchState;
  adminAuth?: AdminAuth;
  onAuthenticated: (token: string, pin: string, nextMatch: MatchState) => void;
  onMatchUpdated: (nextMatch: MatchState) => void;
  onGoHome: () => void;
  onToast: (message: string) => void;
}

/** Coordinator shell for organizer workflows: PIN gate, workspace header, and 3 focused sub-tabs. */
export function OrganizerTab({
  match,
  adminAuth,
  onAuthenticated,
  onMatchUpdated,
  onGoHome,
  onToast
}: OrganizerTabProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'draw' | 'roster' | 'room'>(() =>
    match.players.length === 0 ? 'roster' : 'draw'
  );

  useEffect(() => {
    setSubTab(match.players.length === 0 ? 'roster' : 'draw');
  }, [match.id]);

  const eligiblePlayers = useMemo(
    () =>
      match.players.filter(
        (p) => p.status === 'confirmed' || (match.includeDoubts && p.status === 'doubt')
      ),
    [match.players, match.includeDoubts]
  );

  const revealedCount = useMemo(
    () => eligiblePlayers.filter((p) => p.revealed).length,
    [eligiblePlayers]
  );

  const hasAssignedPlayers = useMemo(
    () => match.players.some((p) => p.teamId !== null),
    [match.players]
  );

  const currentAdminPin = match.adminPin || adminAuth?.pin || '';
  const currentOutfieldCap = Number(match.teams[0]?.outfieldCap) || 6;

  const effectiveAuth = useMemo<AdminAuth>(
    () => ({
      token: adminAuth?.token || match.adminToken || undefined,
      pin: adminAuth?.pin || match.adminPin || undefined
    }),
    [adminAuth, match.adminToken, match.adminPin]
  );

  const runAction = async (label: string, fn: () => Promise<MatchState>, successMsg?: string) => {
    setBusyAction(label);
    try {
      const updated = await fn();
      onMatchUpdated(updated);
      if (successMsg) onToast(successMsg);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao executar ação.');
    } finally {
      setBusyAction(null);
    }
  };

  const ensureOutfieldCapPersisted = async (
    updated: MatchState,
    targetCap: number
  ): Promise<MatchState> => {
    if (Number(updated.teams[0]?.outfieldCap) === targetCap) {
      return updated;
    }
    const patchedTeams = updated.teams.map((t) => ({ ...t, outfieldCap: targetCap }));
    try {
      const saved = await updateMatchSettings(
        match.slug,
        { teams: patchedTeams },
        effectiveAuth
      );
      return {
        ...saved,
        teams: saved.teams.map((t) => ({ ...t, outfieldCap: targetCap }))
      };
    } catch {
      return {
        ...updated,
        teams: patchedTeams
      };
    }
  };

  if (!match.isAdmin) {
    return (
      <OrganizerAuthGate
        slug={match.slug}
        groupName={match.groupName}
        onAuthenticated={onAuthenticated}
        onGoHome={onGoHome}
        onToast={onToast}
      />
    );
  }

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const playerShareUrl = `${originUrl}/?pelada=${encodeURIComponent(match.slug)}`;
  const adminShareUrl = `${originUrl}/?pelada=${encodeURIComponent(match.slug)}&admin=${encodeURIComponent(match.adminToken || '')}`;

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(`${label} copiado!`);
    } catch {
      onToast('Não foi possível copiar.');
    }
  };

  const goToRosterAndFocus = (id: string) => {
    setSubTab('roster');
    window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => el.focus({ preventScroll: true }), 260);
    }, 60);
  };

  const metaSummary = [match.meta.dateLabel, match.meta.timeLabel, match.meta.feeLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-5 space-y-3.5 sm:space-y-5">
      {/* Compact Command Header & Workspace Switcher */}
      <div className="rounded-2xl panel-hero border border-[var(--chalk-line)] p-3.5 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
                Painel do Organizador
              </h2>
              <button
                type="button"
                onClick={() => copyText(match.slug, 'Código da sala')}
                title="Copiar código da sala"
                className="tappable hover-surface inline-flex items-center gap-1 rounded-lg pitch-inset border border-[var(--chalk-line)] px-2 py-0.5 font-mono text-[11px] sm:text-xs font-bold text-[var(--gold-trophy)]"
              >
                <Hash className="w-3 h-3" aria-hidden="true" />
                <span>{match.slug}</span>
                <Copy className="w-3 h-3 text-[var(--ink-muted)]" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[var(--ink-sage)] mt-0.5 tabular-nums">
              {metaSummary ? (
                <span className="text-[var(--gold-trophy)] font-semibold">{metaSummary} · </span>
              ) : null}
              <span>{eligiblePlayers.length} atletas confirmados · {revealedCount}/{eligiblePlayers.length} revelados</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText(playerShareUrl, 'Link dos jogadores')}
              className="tappable hover-gold btn-gold h-8 sm:h-9 px-3 sm:px-3.5 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sm:hidden">Copiar Link</span>
              <span className="hidden sm:inline">Copiar Link da Galera</span>
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="tappable hover-surface h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[var(--chalk-line)] pitch-inset text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[var(--gold-trophy)]" aria-hidden="true" />
              <span>Peladas</span>
            </button>
          </div>
        </div>

        {/* 3 Focused Workspace Tabs */}
        <div
          role="tablist"
          aria-label="Seções do organizador"
          className="grid grid-cols-3 gap-1 p-1 rounded-xl pitch-inset border border-[var(--chalk-line)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'draw'}
            onClick={() => setSubTab('draw')}
            className={`tappable h-9 sm:h-10 rounded-lg px-1 sm:px-2.5 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold transition-colors ${
              subTab === 'draw'
                ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Sorteio</span>
            <span className="hidden sm:inline">Sorteio & Times</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'roster'}
            onClick={() => setSubTab('roster')}
            className={`tappable h-9 sm:h-10 rounded-lg px-1 sm:px-2.5 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold transition-colors ${
              subTab === 'roster'
                ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Lista</span>
            <span className="hidden sm:inline">Lista & Caixa</span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                subTab === 'roster'
                  ? 'bg-[#06160F]/15 text-[#06160F]'
                  : 'bg-[#0D281D] text-[var(--ink-chalk)]'
              }`}
            >
              {match.players.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'room'}
            onClick={() => setSubTab('room')}
            className={`tappable h-9 sm:h-10 rounded-lg px-1 sm:px-2.5 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold transition-colors ${
              subTab === 'room'
                ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Sala</span>
            <span className="hidden sm:inline">Sala & PIN</span>
          </button>
        </div>
      </div>

      {subTab === 'draw' && (
        <DrawConfigPanel
          match={match}
          effectiveAuth={effectiveAuth}
          busyAction={busyAction}
          eligiblePlayers={eligiblePlayers}
          hasAssignedPlayers={hasAssignedPlayers}
          currentOutfieldCap={currentOutfieldCap}
          runAction={runAction}
          ensureOutfieldCapPersisted={ensureOutfieldCapPersisted}
          onMatchUpdated={onMatchUpdated}
          onGoToRosterAndFocus={goToRosterAndFocus}
        />
      )}

      {subTab === 'roster' && (
        <RosterManagerPanel
          match={match}
          effectiveAuth={effectiveAuth}
          busyAction={busyAction}
          currentOutfieldCap={currentOutfieldCap}
          runAction={runAction}
          copyText={copyText}
          onToast={onToast}
        />
      )}

      {subTab === 'room' && (
        <RoomSettingsPanel
          match={match}
          effectiveAuth={effectiveAuth}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          currentAdminPin={currentAdminPin}
          metaSummary={metaSummary}
          playerShareUrl={playerShareUrl}
          adminShareUrl={adminShareUrl}
          runAction={runAction}
          copyText={copyText}
          onAuthenticated={onAuthenticated}
          onGoHome={onGoHome}
          onToast={onToast}
        />
      )}
    </section>
  );
}
