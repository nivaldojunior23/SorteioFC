import {
  Banknote,
  Calendar,
  Clock,
  Hash,
  Home,
  Share2,
  ShieldCheck,
  Shuffle,
  Users,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { MatchState } from '../types';
import { TiraTimeCrest } from './TiraTimeCrest';

export type ActiveTab = 'draw' | 'teams' | 'admin';

interface MatchHeaderProps {
  match: MatchState;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onShareLink: () => void;
  onGoHome: () => void;
}

export function MatchHeader({
  match,
  activeTab,
  onTabChange,
  soundEnabled,
  onToggleSound,
  onShareLink,
  onGoHome
}: MatchHeaderProps) {
  const revealedCount = match.players.filter((p) => p.revealed).length;
  const eligibleCount = match.players.filter(
    (p) => p.status === 'confirmed' || (match.includeDoubts && p.status === 'doubt')
  ).length;

  return (
    <>
      <header className="bg-[#081F15] pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onGoHome}
                title="Voltar para a tela inicial / minhas peladas"
                aria-label="Voltar para a tela inicial"
                className="tappable shrink-0 rounded-xl focus-visible:outline-none"
              >
                <TiraTimeCrest className="w-11 h-11" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-none text-[var(--ink-chalk)]">
                    TiraTime
                  </h1>
                  {match.groupName && match.groupName.toLowerCase() !== 'tiratime' && (
                    <span className="rounded-md bg-[#071A12] border border-[var(--chalk-line)] px-2 py-0.5 text-xs font-bold text-[var(--gold-trophy)]">
                      {match.groupName}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center flex-wrap gap-x-3.5 gap-y-1 text-xs sm:text-sm text-[var(--ink-sage)]">
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-[var(--ink-muted)]">
                    <Hash className="w-3 h-3 text-[var(--gold-trophy)]" />
                    {match.slug}
                  </span>
                  {match.meta.dateLabel && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                      {match.meta.dateLabel}
                    </span>
                  )}
                  {match.meta.timeLabel && (
                    <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                      {match.meta.timeLabel}
                      {match.meta.arrivalNote ? ` (${match.meta.arrivalNote})` : ''}
                    </span>
                  )}
                  {match.meta.feeLabel && (
                    <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                      <Banknote className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                      {match.meta.feeLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onGoHome}
                title="Minhas peladas / Criar outra sala"
                aria-label="Voltar para minhas peladas"
                className="tappable hover-surface h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--ink-sage)]"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Salas</span>
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'Desativar som do sorteio' : 'Ativar som do sorteio'}
                aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
                className="tappable hover-surface w-9 h-9 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] flex items-center justify-center text-[var(--ink-sage)]"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onShareLink}
                className="tappable hover-surface h-9 px-3 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--ink-chalk)]"
              >
                <Share2 className="w-4 h-4 text-[var(--gold-trophy)]" />
                <span className="hidden sm:inline">Enviar Link</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-30 border-b border-[var(--chalk-line)] bg-[#081F15]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-2">
          <nav
            aria-label="Navegação principal"
            className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-locker)] border border-[var(--chalk-line)]"
          >
            <button
              type="button"
              onClick={() => onTabChange('draw')}
              className={`tappable h-10 rounded-lg px-2 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'draw'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <Shuffle className="w-4 h-4 shrink-0" />
              <span>Urna do Sorteio</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('teams')}
              className={`tappable h-10 rounded-lg px-2 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'teams'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Times</span>
              {eligibleCount > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums leading-none ${
                    activeTab === 'teams'
                      ? 'bg-[#071A12]/15 text-[#071A12]'
                      : 'bg-[#071A12]/70 text-[var(--ink-sage)]'
                  }`}
                >
                  {revealedCount}/{eligibleCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange('admin')}
              className={`tappable h-10 rounded-lg px-2 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'admin'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Organizador</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}
