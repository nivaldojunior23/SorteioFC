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
      <header className="bg-gradient-to-b from-[#0C271C] to-[#081D14] pt-[env(safe-area-inset-top)] border-b border-[var(--chalk-line)]/50">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-4 pt-2.5 pb-2.5 space-y-2">
          {/* Top row: Brand + Group Name on left, Quick Action Buttons on right */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onGoHome}
                title="Voltar para a tela inicial / minhas peladas"
                aria-label="Voltar para a tela inicial"
                className="tappable shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]"
              >
                <TiraTimeCrest className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-md" />
              </button>
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                <span
                  translate="no"
                  className="font-display text-lg sm:text-2xl font-black uppercase tracking-tight text-[var(--ink-chalk)] leading-none"
                >
                  SorteioFC
                </span>
                {match.groupName &&
                  match.groupName.toLowerCase() !== 'sorteiofc' &&
                  match.groupName.toLowerCase() !== 'tiratime' && (
                  <span className="rounded-md bg-[#06160F] border border-[var(--gold-trophy)]/35 px-2 py-0.5 text-xs font-bold text-[var(--gold-trophy)] truncate max-w-[170px] sm:max-w-none">
                    {match.groupName}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onShareLink}
                title="Copiar / compartilhar link da pelada"
                aria-label="Compartilhar link da pelada"
                className="tappable hover-surface h-8 px-2.5 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-chalk)]"
              >
                <Share2 className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'Desativar som do sorteio' : 'Ativar som do sorteio'}
                aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
                className="tappable hover-surface w-8 h-8 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] flex items-center justify-center text-[var(--ink-sage)]"
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onGoHome}
                title="Minhas peladas / Criar outra sala"
                aria-label="Voltar para minhas peladas"
                className="tappable hover-surface w-8 h-8 sm:w-auto sm:h-8 sm:px-2.5 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] inline-flex items-center justify-center gap-1 text-xs font-semibold text-[var(--ink-sage)]"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salas</span>
              </button>
            </div>
          </div>

          {/* Full-width Match Details Strip — 100% visible on mobile, no cut-off! */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-sage)] pt-1.5 border-t border-[var(--chalk-line)]/40">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--gold-trophy)] shrink-0">
              <Hash className="w-3 h-3" />
              {match.slug}
            </span>

            {match.meta.dateLabel && (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink-chalk)] shrink-0">
                <Calendar className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                <span>{match.meta.dateLabel}</span>
              </span>
            )}

            {match.meta.timeLabel && (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink-chalk)] tabular-nums shrink-0">
                <Clock className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                <span>{match.meta.timeLabel}</span>
                {match.meta.arrivalNote && (
                  <span className="text-[11px] font-normal text-[var(--ink-sage)]">
                    ({match.meta.arrivalNote})
                  </span>
                )}
              </span>
            )}

            {match.meta.feeLabel && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-300 tabular-nums shrink-0">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>{match.meta.feeLabel}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-30 border-b border-[var(--chalk-line)] bg-[#071A12]/92 backdrop-blur-md shadow-[0_10px_28px_-18px_rgba(0,0,0,0.85)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 sm:py-2">
          <nav
            aria-label="Navegação principal"
            className="grid grid-cols-3 gap-1 p-1 rounded-xl pitch-inset border border-[var(--chalk-line)]"
          >
            <button
              type="button"
              onClick={() => onTabChange('draw')}
              className={`tappable h-9 sm:h-10 rounded-lg px-1.5 sm:px-2 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'draw'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="sm:hidden">Urna</span>
              <span className="hidden sm:inline">Urna do Sorteio</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('teams')}
              className={`tappable h-9 sm:h-10 rounded-lg px-1.5 sm:px-2 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'teams'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Times</span>
              {eligibleCount > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] sm:text-xs tabular-nums leading-none font-bold ${
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
              className={`tappable h-9 sm:h-10 rounded-lg px-1.5 sm:px-2 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'admin'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Organizador</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}
