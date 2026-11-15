import { useState } from 'react';
import {
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Shuffle,
  Unlock,
  Upload,
  Users
} from 'lucide-react';
import { executeDraw, updateMatchSettings, type AdminAuth } from '../../lib/api';
import type { MatchState, Player, TeamConfig } from '../../types';
import { VestBadge } from '../TiraTimeCrest';
import { ConfirmAlertDialog } from './ConfirmAlertDialog';
import { TacticalFormationPreview } from './TacticalFormationPreview';

const COLOR_PRESETS: Array<Pick<TeamConfig, 'shortName' | 'color' | 'textColor' | 'borderColor'>> = [
  { shortName: 'Ouro', color: '#EAB308', textColor: '#0A1E15', borderColor: '#FDE047' },
  { shortName: 'Preto', color: '#1C221F', textColor: '#F5F2E8', borderColor: '#717E77' },
  { shortName: 'Branco', color: '#F5F2E8', textColor: '#0A1E15', borderColor: '#D6D1C2' },
  { shortName: 'Azul', color: '#2563EB', textColor: '#F5F2E8', borderColor: '#60A5FA' },
  { shortName: 'Vermelho', color: '#DC2626', textColor: '#F5F2E8', borderColor: '#F87171' },
  { shortName: 'Verde', color: '#10B981', textColor: '#071A12', borderColor: '#34D399' }
];

interface PendingConfirmDraw {
  action: 'run_full_draw' | 'draw_and_reveal' | 'open_live_urn';
  actionKey: string;
  title: string;
  description: string;
  successMsg: string;
}

interface DrawConfigPanelProps {
  match: MatchState;
  effectiveAuth: AdminAuth;
  busyAction: string | null;
  eligiblePlayers: Player[];
  hasAssignedPlayers: boolean;
  currentOutfieldCap: number;
  runAction: (label: string, fn: () => Promise<MatchState>, successMsg?: string) => Promise<void>;
  ensureOutfieldCapPersisted: (updated: MatchState, targetCap: number) => Promise<MatchState>;
  onMatchUpdated: (nextMatch: MatchState) => void;
  onGoToRosterAndFocus: (elementId: string) => void;
}

/** Organizer Tab 1: draw execution, anti-misclick device lock, public visibility, and formation config. */
export function DrawConfigPanel({
  match,
  effectiveAuth,
  busyAction,
  eligiblePlayers,
  hasAssignedPlayers,
  currentOutfieldCap,
  runAction,
  ensureOutfieldCapPersisted,
  onMatchUpdated,
  onGoToRosterAndFocus
}: DrawConfigPanelProps) {
  const [pendingConfirmAction, setPendingConfirmAction] = useState<PendingConfirmDraw | null>(null);

  const handleChangeOutfieldCap = (lineCount: number) => {
    const nextTeams = match.teams.map((t) => ({ ...t, outfieldCap: lineCount }));
    onMatchUpdated({ ...match, teams: nextTeams });
    runAction(
      'outfield-cap',
      async () => {
        const updated = await updateMatchSettings(
          match.slug,
          {
            teams: nextTeams,
            outfieldPerTeam: lineCount,
            outfieldCap: lineCount
          },
          effectiveAuth
        );
        return ensureOutfieldCapPersisted(updated, lineCount);
      },
      `Formação ajustada: ${lineCount} na linha + 1 no gol por time.`
    );
  };

  const handleTriggerDrawAction = (
    action: PendingConfirmDraw['action'],
    actionKey: string,
    title: string,
    description: string,
    successMsg: string
  ) => {
    if (hasAssignedPlayers) {
      setPendingConfirmAction({ action, actionKey, title, description, successMsg });
      return;
    }
    runAction(
      actionKey,
      async () => {
        const updated = await executeDraw(match.slug, action, effectiveAuth);
        return ensureOutfieldCapPersisted(updated, currentOutfieldCap);
      },
      successMsg
    );
  };

  const handleTeamUpdate = (index: number, patch: Partial<TeamConfig>) => {
    const nextTeams = match.teams.map((t, i) => (i === index ? { ...t, ...patch } : t));
    runAction('team-update', () => updateMatchSettings(match.slug, { teams: nextTeams }, effectiveAuth));
  };

  return (
    <div className="space-y-5">
      {match.players.length === 0 && (
        <div className="rounded-2xl border border-[var(--gold-trophy)]/40 bg-[var(--gold-trophy)]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[var(--gold-trophy)]/20 border border-[var(--gold-trophy)]/40 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold uppercase text-[var(--ink-chalk)]">
                A lista ainda está vazia
              </h3>
              <p className="text-xs text-[var(--ink-sage)]">
                Cole a lista do WhatsApp ou cadastre os jogadores na aba Lista & Caixa para liberar o sorteio.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onGoToRosterAndFocus('whatsapp-list-input')}
              className="tappable hover-gold btn-gold h-9 px-3.5 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-xs inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Colar Lista do WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => onGoToRosterAndFocus('quick-add-name')}
              className="tappable hover-surface h-9 px-3.5 rounded-xl border border-[var(--chalk-line-strong)] pitch-inset text-[var(--ink-chalk)] font-semibold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--gold-trophy)]" aria-hidden="true" />
              <span>Adicionar Manual</span>
            </button>
          </div>
        </div>
      )}

      {/* Bloco 1: Execução do Sorteio & Visibilidade */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Ação do Sorteio
            </h3>
            <p className="text-xs sm:text-sm text-[var(--ink-sage)] mt-0.5">
              {match.drawMode === 'live_urn'
                ? 'Cada atleta puxa sua bolinha na urna pelo celular ao chegar na quadra.'
                : 'Os times são definidos em segredo antes e cada atleta revela sua bolinha no link.'}
            </p>
          </div>

          {/* Clean Segmented Mode Switch */}
          <div
            className="flex items-center gap-1 pitch-inset p-1 rounded-xl border border-[var(--chalk-line)] self-start shrink-0"
            role="group"
            aria-label="Modo de sorteio"
          >
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'mode-live',
                  async () => {
                    const updated = await updateMatchSettings(
                      match.slug,
                      { drawMode: 'live_urn' },
                      effectiveAuth
                    );
                    return ensureOutfieldCapPersisted(updated, currentOutfieldCap);
                  },
                  'Urna Ao Vivo aberta! Os jogadores tiram a bolinha e formam os times na hora.'
                )
              }
              className={`tappable h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                match.drawMode === 'live_urn'
                  ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                  : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
              }`}
            >
              Urna Ao Vivo
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'mode-closed',
                  async () => {
                    const updated = await updateMatchSettings(
                      match.slug,
                      { drawMode: 'closed_reveal' },
                      effectiveAuth
                    );
                    return ensureOutfieldCapPersisted(updated, currentOutfieldCap);
                  },
                  'Modo Sorteio Fechado ativado! Cada jogador abre sua bolinha.'
                )
              }
              className={`tappable h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                match.drawMode === 'closed_reveal'
                  ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                  : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
              }`}
            >
              Sorteio Fechado
            </button>
          </div>
        </div>

        {/* Confirmation alert dialog when overwriting existing assignments */}
        {pendingConfirmAction && (
          <ConfirmAlertDialog
            title={pendingConfirmAction.title}
            description={pendingConfirmAction.description}
            confirmLabel="Sim, confirmar ação"
            busy={busyAction !== null}
            onCancel={() => setPendingConfirmAction(null)}
            onConfirm={() => {
              const item = pendingConfirmAction;
              setPendingConfirmAction(null);
              runAction(
                item.actionKey,
                async () => {
                  const updated = await executeDraw(match.slug, item.action, effectiveAuth);
                  return ensureOutfieldCapPersisted(updated, currentOutfieldCap);
                },
                item.successMsg
              );
            }}
          />
        )}

        {/* Primary & Secondary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {match.drawMode === 'live_urn' ? (
            <>
              <button
                type="button"
                disabled={busyAction !== null || eligiblePlayers.length === 0}
                onClick={() =>
                  handleTriggerDrawAction(
                    'open_live_urn',
                    'open-live-urn',
                    'Zerar e abrir a Urna Ao Vivo',
                    'Já existem atletas com times atribuídos nesta partida. Deseja reiniciar a urna e colocar todas as bolinhas de volta?',
                    'Urna Ao Vivo zerada e pronta para o pessoal sortear na chegada.'
                  )
                }
                className="tappable hover-gold btn-gold h-11 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Zerar e Abrir Urna Ao Vivo</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null || eligiblePlayers.length === 0}
                onClick={() =>
                  handleTriggerDrawAction(
                    'draw_and_reveal',
                    'draw-and-reveal',
                    'Preencher vagas automaticamente',
                    'Deseja sortear e preencher todos os times automaticamente agora? Os jogadores já verão seus times definidos na hora.',
                    'Todas as vagas foram preenchidas automaticamente pelo sorteio!'
                  )
                }
                className="tappable hover-surface h-11 px-4 rounded-xl border border-[var(--chalk-line-strong)] pitch-inset text-[var(--ink-chalk)] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Shuffle className="w-4 h-4 text-[var(--gold-trophy)] shrink-0" aria-hidden="true" />
                <span>Preencher Vagas Automaticamente</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busyAction !== null || eligiblePlayers.length === 0}
                onClick={() =>
                  handleTriggerDrawAction(
                    'run_full_draw',
                    'run-full-draw',
                    'Sortear times em segredo',
                    'Deseja realizar um novo sorteio? Todos os times serão redistribuídos em segredo.',
                    'Novo sorteio realizado! As bolinhas foram embaralhadas em segredo.'
                  )
                }
                className="tappable hover-gold btn-gold h-11 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Shuffle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Embaralhar & Sortear em Segredo</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null || eligiblePlayers.length === 0}
                onClick={() =>
                  handleTriggerDrawAction(
                    'open_live_urn',
                    'open-live-urn',
                    'Mudar para Urna Ao Vivo',
                    'Deseja alternar para Urna Ao Vivo? As vagas serão zeradas para que os jogadores retirem suas bolinhas.',
                    'Modo Urna Ao Vivo ativado! A galera pode tirar as bolinhas na chegada.'
                  )
                }
                className="tappable hover-surface h-11 px-4 rounded-xl border border-[var(--chalk-line-strong)] pitch-inset text-[var(--ink-chalk)] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4 text-[var(--gold-trophy)] shrink-0" aria-hidden="true" />
                <span>Mudar para Urna Ao Vivo</span>
              </button>
            </>
          )}
        </div>

        {/* Public visibility + Anti-misclick device lock */}
        <div className="border-t border-[var(--chalk-line)] pt-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap text-xs">
              <span className="font-semibold text-[var(--ink-sage)]">
                Painel público (aba Times):
              </span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded-full border ${
                  match.revealAllPublic
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                }`}
              >
                {match.revealAllPublic ? 'Tudo Revelado' : 'Sem Spoiler'}
              </span>
              <span className="text-[var(--ink-muted)]">
                {match.revealAllPublic
                  ? 'Todos veem a escalação completa.'
                  : 'Quem ainda não abriu aparece como "?".'}
              </span>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'toggle-reveal-all',
                  () =>
                    executeDraw(
                      match.slug,
                      match.revealAllPublic ? 'hide_all' : 'reveal_all',
                      effectiveAuth
                    ),
                  match.revealAllPublic
                    ? 'Times ocultados no painel público (Modo Sem Spoiler ativado)!'
                    : 'Todos os times foram revelados publicamente no painel!'
                )
              }
              className="tappable hover-surface h-9 px-3.5 rounded-xl border border-[var(--chalk-line-strong)] pitch-inset text-xs font-bold text-[var(--ink-chalk)] inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              {match.revealAllPublic ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                  <span>Ativar Sem Spoiler</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[var(--gold-trophy)]" aria-hidden="true" />
                  <span>Revelar Todos os Times</span>
                </>
              )}
            </button>
          </div>

          <div className="border-t border-[var(--chalk-line)]/70 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs">
              {match.lockOnePerDevice ? (
                <Lock className="w-4 h-4 text-[var(--gold-trophy)] shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <Unlock className="w-4 h-4 text-[var(--ink-muted)] shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div>
                <div className="font-semibold text-[var(--ink-chalk)] flex items-center gap-2 flex-wrap">
                  <span>Travar 1 jogador por celular</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[11px] border ${
                      match.lockOnePerDevice
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : 'bg-[#081F15] text-[var(--ink-muted)] border-[var(--chalk-line)]'
                    }`}
                  >
                    {match.lockOnePerDevice ? 'Ativada' : 'Opcional'}
                  </span>
                </div>
                <p className="text-[var(--ink-muted)] mt-0.5">
                  Impede que a mesma pessoa clique por engano no nome de outro colega e puxe a bolinha dele.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'toggle-device-lock',
                  () =>
                    updateMatchSettings(
                      match.slug,
                      { lockOnePerDevice: !match.lockOnePerDevice },
                      effectiveAuth
                    ),
                  !match.lockOnePerDevice
                    ? 'Trava ativada: cada celular sorteia apenas 1 jogador por rodada.'
                    : 'Trava por celular desativada (útil se alguém sortear sem celular).'
                )
              }
              className={`tappable h-9 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 ${
                match.lockOnePerDevice
                  ? 'border-[var(--gold-trophy)]/45 bg-[var(--gold-trophy)]/15 text-[var(--gold-trophy)]'
                  : 'border-[var(--chalk-line-strong)] pitch-inset text-[var(--ink-chalk)] hover-surface'
              }`}
            >
              {match.lockOnePerDevice ? (
                <>
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Trava Ativada</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-[var(--ink-sage)]" aria-hidden="true" />
                  <span>Ativar Trava</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bloco 2: Formação & Coletes */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Formação & Coletes
            </h3>
            <p className="text-xs sm:text-sm text-[var(--ink-sage)]">
              {match.balanceGk
                ? 'Goleiro separado: cada time garante 1 goleiro fixo + vagas na linha.'
                : 'Tudo junto: todos os atletas entram no mesmo sorteio sem goleiro fixo.'}
            </p>
          </div>
        </div>

        {/* Organized, non-duplicated formation controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
          {/* Goleiros */}
          <div className="lg:col-span-4 space-y-1.5">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Goleiros no sorteio
            </span>
            <div
              className="grid grid-cols-2 gap-1 pitch-inset p-1 rounded-xl border border-[var(--chalk-line)]"
              role="group"
              aria-label="Modo de sorteio dos goleiros"
            >
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  if (!match.balanceGk) {
                    runAction(
                      'balance-gk-on',
                      () => updateMatchSettings(match.slug, { balanceGk: true }, effectiveAuth),
                      'Modo Goleiro Separado ativado (1 no gol + linha).'
                    );
                  }
                }}
                className={`tappable h-8 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  match.balanceGk
                    ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                    : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Separado</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  if (match.balanceGk) {
                    runAction(
                      'balance-gk-off',
                      () => updateMatchSettings(match.slug, { balanceGk: false }, effectiveAuth),
                      'Modo Tudo Junto ativado! Todos são sorteados juntos sem separar goleiro.'
                    );
                  }
                }}
                className={`tappable h-8 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  !match.balanceGk
                    ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                    : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Tudo Junto</span>
              </button>
            </div>
          </div>

          {/* Quantidade de Times */}
          <div className="lg:col-span-3 space-y-1.5">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Quantidade de times
            </span>
            <div className="grid grid-cols-3 gap-1 pitch-inset p-1 rounded-xl border border-[var(--chalk-line)]">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() =>
                    runAction(
                      'team-count',
                      async () => {
                        const updated = await updateMatchSettings(
                          match.slug,
                          { teamCount: count, outfieldPerTeam: currentOutfieldCap, outfieldCap: currentOutfieldCap },
                          effectiveAuth
                        );
                        return ensureOutfieldCapPersisted(updated, currentOutfieldCap);
                      },
                      `Ajustado para ${count} times.`
                    )
                  }
                  className={`tappable h-8 px-2 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                    match.teams.length === count
                      ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                      : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                  }`}
                >
                  {count} Times
                </button>
              ))}
            </div>
          </div>

          {/* Na linha */}
          <div className="lg:col-span-3 space-y-1.5">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Na linha (+1 gol)
            </span>
            <div
              className="grid grid-cols-6 gap-1 pitch-inset p-1 rounded-xl border border-[var(--chalk-line)]"
              role="group"
              aria-label="Jogadores na linha por time"
            >
              {[4, 5, 6, 7, 8, 10].map((lineCount) => {
                const isSelected = currentOutfieldCap === lineCount;
                return (
                  <button
                    key={lineCount}
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleChangeOutfieldCap(lineCount)}
                    className={`tappable h-8 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[var(--gold-trophy)] text-[#06160F]'
                        : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                    }`}
                  >
                    {lineCount}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dúvidas */}
          <div className="lg:col-span-2 space-y-1.5">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Dúvidas
            </span>
            <button
              type="button"
              onClick={() =>
                runAction('include-doubts', () =>
                  updateMatchSettings(match.slug, { includeDoubts: !match.includeDoubts }, effectiveAuth)
                )
              }
              className={`tappable w-full h-10 px-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
                match.includeDoubts
                  ? 'border-amber-400/40 bg-amber-950/60 text-amber-200'
                  : 'border-[var(--chalk-line)] pitch-inset text-[var(--ink-sage)] hover-surface'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{match.includeDoubts ? 'Incluir' : 'De fora'}</span>
            </button>
          </div>
        </div>

        {/* Tactical Formation Preview */}
        <TacticalFormationPreview
          teams={match.teams}
          outfieldCap={currentOutfieldCap}
          balanceGk={match.balanceGk}
          players={match.players}
          eligibleCount={eligiblePlayers.length}
        />

        {/* Team Names & Colors Customization */}
        <div className="border-t border-[var(--chalk-line)] pt-4 space-y-3">
          <div className="text-xs font-semibold text-[var(--ink-sage)]">
            Nomes e cores dos coletes
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {match.teams.map((team, idx) => (
              <div key={team.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg pitch-inset border border-[var(--chalk-line)] flex items-center justify-center shrink-0">
                    <VestBadge team={team} size="sm" />
                  </div>
                  <input
                    key={`${team.id}-${team.name}`}
                    type="text"
                    aria-label={`Nome do time ${idx + 1}`}
                    defaultValue={team.name}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val && val !== team.name) {
                        const matchedPreset = COLOR_PRESETS.find((p) =>
                          new RegExp(`\\b${p.shortName}\\b`, 'i').test(val)
                        );
                        handleTeamUpdate(idx, {
                          name: val,
                          shortName: val.slice(0, 14),
                          ...(matchedPreset
                            ? {
                                color: matchedPreset.color,
                                textColor: matchedPreset.textColor,
                                borderColor: matchedPreset.borderColor
                              }
                            : {})
                        });
                      }
                    }}
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base font-semibold focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pl-10">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.shortName}
                      type="button"
                      title={preset.shortName}
                      aria-label={`Cor ${preset.shortName}`}
                      onClick={() => {
                        handleTeamUpdate(idx, {
                          color: preset.color,
                          textColor: preset.textColor,
                          borderColor: preset.borderColor
                        });
                      }}
                      className={`tappable w-6 h-6 rounded-full border-2 ${
                        team.color.toLowerCase() === preset.color.toLowerCase()
                          ? 'ring-2 ring-[var(--gold-trophy)] ring-offset-2 ring-offset-[#06160F]'
                          : ''
                      }`}
                      style={{ backgroundColor: preset.color, borderColor: preset.borderColor }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
