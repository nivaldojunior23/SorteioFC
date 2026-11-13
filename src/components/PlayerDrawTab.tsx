import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Search,
  Shield,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { playDrawSpinCue, playRevealSuccessCue, revealPlayer } from '../lib/api';
import type { MatchState, Player, TeamConfig } from '../types';
import { TiraTimeCrest, VestBadge } from './TiraTimeCrest';

interface PlayerDrawTabProps {
  match: MatchState;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  onMatchUpdated: (nextMatch: MatchState) => void;
  onGoToTeams: () => void;
  soundEnabled: boolean;
}

type RosterFilter = 'all' | 'pending' | 'revealed';

export function PlayerDrawTab({
  match,
  selectedPlayerId,
  onSelectPlayer,
  onMatchUpdated,
  onGoToTeams,
  soundEnabled
}: PlayerDrawTabProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [isDrawing, setIsDrawing] = useState(false);
  const [cyclingIdx, setCyclingIdx] = useState(0);
  const [revealedResult, setRevealedResult] = useState<{
    team: TeamConfig;
    teammates: Player[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPlayer = useMemo(
    () => match.players.find((p) => p.id === selectedPlayerId) ?? null,
    [match.players, selectedPlayerId]
  );

  // Sync revealedResult when selectedPlayer changes or SSE updates arrive
  useEffect(() => {
    setErrorMsg(null);
    if (!selectedPlayer || !selectedPlayer.revealed || !selectedPlayer.teamId) {
      setRevealedResult(null);
      return;
    }
    const team = match.teams.find((t) => t.id === selectedPlayer.teamId);
    if (!team) {
      setRevealedResult(null);
      return;
    }
    const teammates = match.players.filter(
      (p) => p.teamId === team.id && p.id !== selectedPlayer.id
    );
    setRevealedResult({ team, teammates });
  }, [selectedPlayer, match.teams, match.players]);

  // Cycle team vest preview with progressive deceleration during the 3s draw animation
  useEffect(() => {
    if (!isDrawing || match.teams.length === 0) return;
    let cancelled = false;
    let timerId: number | undefined;
    const startedAt = Date.now();

    const step = () => {
      if (cancelled) return;
      setCyclingIdx((prev) => (prev + 1) % match.teams.length);
      const elapsed = Date.now() - startedAt;
      const delay = elapsed < 1000 ? 120 : elapsed < 1800 ? 185 : elapsed < 2450 ? 270 : 420;
      timerId = window.setTimeout(step, delay);
    };

    timerId = window.setTimeout(step, 120);
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [isDrawing, match.teams.length]);

  const filteredPlayers = useMemo(() => {
    const q = query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return match.players.filter((p) => {
      if (p.status === 'out') return false;
      if (filter === 'pending' && p.revealed) return false;
      if (filter === 'revealed' && !p.revealed) return false;
      if (!q) return true;
      const normName = p.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return normName.includes(q) || String(p.listNumber || '').includes(q);
    });
  }, [match.players, query, filter]);

  const outfieldPlayers = filteredPlayers.filter((p) => p.role !== 'gk');
  const goalkeepers = filteredPlayers.filter((p) => p.role === 'gk');

  const teamById = useMemo(() => {
    const map = new Map<string, TeamConfig>();
    match.teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [match.teams]);

  const handleDrawReveal = async () => {
    if (!selectedPlayer || isDrawing) return;
    setErrorMsg(null);

    if (selectedPlayer.status === 'doubt' && !match.includeDoubts && !selectedPlayer.teamId) {
      setErrorMsg(
        `${selectedPlayer.name} está marcado como dúvida. Peça ao organizador para confirmar a presença no painel antes do sorteio.`
      );
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinDuration = prefersReducedMotion ? 320 : 3000;

    setIsDrawing(true);
    playDrawSpinCue(soundEnabled, prefersReducedMotion);

    try {
      const [res] = await Promise.all([
        revealPlayer(match.slug, selectedPlayer.id),
        new Promise((resolve) => setTimeout(resolve, spinDuration))
      ]);
      onMatchUpdated(res.match);
      setRevealedResult({ team: res.team, teammates: res.teammates });
      playRevealSuccessCue(soundEnabled);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível concluir o sorteio.');
    } finally {
      setIsDrawing(false);
    }
  };

  if (selectedPlayer) {
    const assignedTeam =
      revealedResult?.team ??
      (selectedPlayer.teamId ? teamById.get(selectedPlayer.teamId) ?? null : null);

    const previewTeam = match.teams[cyclingIdx % Math.max(1, match.teams.length)];
    const isBlockedDoubt =
      selectedPlayer.status === 'doubt' && !match.includeDoubts && !selectedPlayer.teamId;

    return (
      <section className="max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] overflow-hidden">
          {/* Selected player identity bar */}
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--chalk-line)] bg-[var(--bg-pitch)] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-[#071A12] border border-[var(--chalk-line-strong)] flex items-center justify-center font-display text-xl font-bold text-[var(--gold-trophy)] tabular-nums shrink-0">
                {selectedPlayer.listNumber ?? '•'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-[var(--ink-chalk)] truncate">
                    {selectedPlayer.name}
                  </h2>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      selectedPlayer.role === 'gk'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'bg-[#071A12]/70 text-[var(--ink-sage)] border border-[var(--chalk-line)]'
                    }`}
                  >
                    {selectedPlayer.role === 'gk' ? 'Goleiro' : 'Linha'}
                  </span>
                  {selectedPlayer.isGuest && (
                    <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-sky-500/15 text-sky-200 border border-sky-400/25">
                      Convidado
                    </span>
                  )}
                </div>
                {selectedPlayer.note && (
                  <p className="text-xs text-[var(--ink-sage)] mt-0.5">{selectedPlayer.note}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={isDrawing}
              onClick={() => {
                if (!isDrawing) onSelectPlayer(null);
              }}
              className="tappable hover-surface h-9 px-3 rounded-lg border border-[var(--chalk-line)] bg-[#071A12]/70 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-sage)] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Trocar jogador
            </button>
          </div>

          {/* Draw Stage OR Revealed Team Card */}
          {isDrawing || !selectedPlayer.revealed || !assignedTeam ? (
            <div
              className="relative px-5 pt-6 pb-8 sm:pt-7 sm:pb-10 text-center overflow-hidden"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse 72% 52% at 50% 24%, rgba(234, 179, 8, 0.16), rgba(16, 185, 129, 0.09) 48%, transparent 78%)'
              }}
            >
              <div className="relative z-10 flex flex-col items-center">
                {/* Dedicated upper orb stage */}
                <div className="relative w-full max-w-md h-44 sm:h-48 flex items-center justify-center">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 400 180"
                    className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(ellipse 75% 75% at 50% 50%, black 42%, transparent 80%)',
                      maskImage:
                        'radial-gradient(ellipse 75% 75% at 50% 50%, black 42%, transparent 80%)'
                    }}
                    preserveAspectRatio="xMidYMid slice"
                  >
                    <line x1="0" y1="90" x2="400" y2="90" stroke="#F5F2E8" strokeWidth="1.5" />
                    <circle cx="200" cy="90" r="66" fill="none" stroke="#F5F2E8" strokeWidth="1.5" />
                    <circle cx="200" cy="90" r="3" fill="#F5F2E8" />
                  </svg>

                  {/* Draw Capsule / Bolinha */}
                  <div
                    className={`relative z-10 w-36 h-36 sm:w-40 sm:h-40 rounded-full border-2 flex flex-col items-center justify-center transition-colors ${
                      isDrawing
                        ? 'orb-drawing border-[var(--gold-trophy)] bg-[#0A251A]'
                        : 'orb-idle border-[var(--gold-trophy)]/75 bg-gradient-to-b from-[#164230] to-[#081F15]'
                    }`}
                  >
                    {isDrawing && previewTeam ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <VestBadge team={previewTeam} size="lg" />
                        <span className="font-display text-lg font-bold uppercase text-[var(--ink-chalk)]">
                          {previewTeam.shortName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <TiraTimeCrest className="w-16 h-16" />
                        <span className="text-xs font-semibold text-[var(--gold-trophy)]">
                          Tirar time
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="mt-4 font-display text-2xl sm:text-3xl font-bold uppercase text-[var(--ink-chalk)]">
                  {isDrawing
                    ? 'Girando a urna e sorteando seu time...'
                    : isBlockedDoubt
                      ? 'Presença em dúvida'
                      : 'Tire sua bolinha da urna'}
                </h3>

                <p className="mt-2 max-w-[48ch] text-sm text-[var(--ink-sage)] leading-relaxed">
                  {isDrawing
                    ? `Separando os times (${match.teams[0]?.outfieldCap ?? 6} na linha e 1 no gol) no TiraTime.`
                    : isBlockedDoubt
                      ? `Você está marcado como dúvida${selectedPlayer.note ? ` (${selectedPlayer.note})` : ''}. Assim que o organizador confirmar você na lista, o sorteio libera.`
                      : 'Toque no botão abaixo para tirar sua bolinha da urna e descobrir em qual time você caiu hoje.'}
                </p>

                {errorMsg && (
                  <div
                    role="alert"
                    className="mt-4 max-w-md rounded-xl border border-amber-400/35 bg-amber-950/60 px-4 py-3 text-sm text-amber-100 flex items-start gap-2.5 text-left"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs sm:max-w-md justify-center">
                  <button
                    type="button"
                    disabled={isDrawing || isBlockedDoubt}
                    onClick={handleDrawReveal}
                    className="tappable hover-gold w-full sm:w-auto min-w-[240px] h-12 px-6 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-base inline-flex items-center justify-center gap-2 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-5 h-5" />
                    {isDrawing ? 'Sorteando...' : 'Tirar Bolinha da Urna'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Simple Revealed Team Card — full team formation suspense stays in the Times tab */
            <div className="card-reveal p-5 sm:p-6">
              <div
                className="rounded-xl p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{
                  backgroundColor: assignedTeam.color,
                  color: assignedTeam.textColor,
                  borderColor: assignedTeam.borderColor
                }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-xl bg-[#071A12] border border-white/15 flex items-center justify-center shrink-0">
                    <VestBadge team={assignedTeam} size="lg" />
                  </div>
                  <div>
                    <h3 className="font-display text-3xl sm:text-4xl font-extrabold uppercase leading-none">
                      {assignedTeam.name}
                    </h3>
                    <p className="text-sm font-semibold opacity-90 mt-1">
                      Você está escalado no {assignedTeam.name} hoje!
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/15 px-3 py-1.5 text-sm font-bold self-start sm:self-center">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{selectedPlayer.role === 'gk' ? 'Goleiro do Time' : 'Jogador de Linha'}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-[var(--chalk-line)] flex flex-wrap items-center justify-between gap-3">
                {match.meta.feeAmount > 0 ? (
                  <div className="text-xs text-[var(--ink-sage)]">
                    Pagamento:{' '}
                    {selectedPlayer.paid ? (
                      <span className="text-emerald-300 font-semibold">
                        R$ {match.meta.feeAmount} pago
                      </span>
                    ) : (
                      <span className="text-amber-200 font-semibold">
                        R$ {match.meta.feeAmount} pendente com o organizador
                      </span>
                    )}
                  </div>
                ) : selectedPlayer.paid ? (
                  <div className="text-xs text-emerald-300 font-semibold">Pagamento confirmado</div>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={onGoToTeams}
                  className="tappable hover-gold h-10 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  Ver Times se Formando
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Initial Screen: Simple, clean Player List to pick your own name
  return (
    <section className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-[var(--ink-chalk)]">
              Quem é você na lista?
            </h2>
            <p className="text-sm text-[var(--ink-sage)] mt-0.5">
              Toque no seu nome abaixo para tirar sua bolinha na urna e descobrir seu time.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#071A12] p-1 rounded-xl border border-[var(--chalk-line)] self-start">
            {(
              [
                ['all', 'Todos'],
                ['pending', 'Falta sortear'],
                ['revealed', 'Já sorteados']
              ] as Array<[RosterFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`tappable h-8 px-3 rounded-lg text-xs font-semibold ${
                  filter === value
                    ? 'bg-[var(--bg-pitch-raised)] text-[var(--ink-chalk)]'
                    : 'text-[var(--ink-muted)] hover-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 16px Search Input to prevent mobile Safari auto-zoom */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 text-[var(--ink-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar seu nome ou número..."
            enterKeyHint="search"
            aria-label="Buscar jogador na lista"
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#071A12] border border-[var(--chalk-line)] text-base text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="tappable absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Outfield Players */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)]">
            Jogadores de Linha
          </h3>
          <span className="text-xs font-semibold text-[var(--ink-sage)] tabular-nums">
            {outfieldPlayers.length} na lista
          </span>
        </div>

        {outfieldPlayers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--chalk-line)] bg-[var(--bg-locker)]/60 p-6 text-center text-sm text-[var(--ink-sage)]">
            Nenhum jogador encontrado com esse filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {outfieldPlayers.map((player) => {
              const team = player.teamId ? teamById.get(player.teamId) : undefined;
              const isDoubt = player.status === 'doubt' && !match.includeDoubts && !player.teamId;

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player.id)}
                  className="tappable hover-lift text-left rounded-xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] hover-surface px-3.5 py-3 flex items-center justify-between gap-2.5 min-h-[58px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] flex items-center justify-center text-xs font-bold text-[var(--gold-trophy)] tabular-nums shrink-0">
                      {player.listNumber ?? '•'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ink-chalk)] truncate">
                        {player.name}
                      </div>
                      {(player.note || player.isGuest) && (
                        <div className="text-xs text-[var(--ink-muted)] truncate">
                          {player.note || 'Convidado'}
                        </div>
                      )}
                    </div>
                  </div>

                  {player.revealed && team ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border"
                      style={{
                        backgroundColor: team.color,
                        color: team.textColor,
                        borderColor: team.borderColor
                      }}
                    >
                      {team.shortName}
                    </span>
                  ) : isDoubt ? (
                    <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold bg-amber-500/15 text-amber-200 border border-amber-400/30">
                      Dúvida
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold bg-[var(--gold-trophy)]/15 text-[var(--gold-trophy)] border border-[var(--gold-trophy)]/35">
                      Sortear
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Goalkeepers */}
      {goalkeepers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--gold-trophy)]" />
              Goleiros
            </h3>
            <span className="text-xs font-semibold text-[var(--ink-sage)] tabular-nums">
              {goalkeepers.length} {goalkeepers.length === 1 ? 'goleiro' : 'goleiros'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {goalkeepers.map((gk) => {
              const team = gk.teamId ? teamById.get(gk.teamId) : undefined;
              return (
                <button
                  key={gk.id}
                  type="button"
                  onClick={() => onSelectPlayer(gk.id)}
                  className="tappable hover-lift text-left rounded-xl border border-amber-400/25 bg-[var(--bg-pitch)] hover-surface px-3.5 py-3 flex items-center justify-between gap-2.5 min-h-[58px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-xs font-bold text-amber-200 tabular-nums shrink-0">
                      {gk.listNumber ?? 'GL'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ink-chalk)] truncate">
                        {gk.name}
                      </div>
                      <div className="text-xs text-[var(--ink-sage)]">Goleiro</div>
                    </div>
                  </div>

                  {gk.revealed && team ? (
                    <span
                      className="shrink-0 inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold border"
                      style={{
                        backgroundColor: team.color,
                        color: team.textColor,
                        borderColor: team.borderColor
                      }}
                    >
                      {team.shortName}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold bg-[var(--gold-trophy)]/15 text-[var(--gold-trophy)] border border-[var(--gold-trophy)]/35">
                      Sortear
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Open slots notice */}
      {match.openSlots.length > 0 && (
        <div className="rounded-xl border border-[var(--chalk-line)] bg-[var(--bg-locker)]/80 px-4 py-3 text-xs sm:text-sm text-[var(--ink-sage)] flex items-center justify-between gap-2 flex-wrap">
          <span>
            Vagas em aberto na lista:{' '}
            <strong className="text-[var(--ink-chalk)] tabular-nums">
              {match.openSlots.map((s) => `#${s.listNumber}`).join(', ')}
            </strong>
          </span>
          <span className="text-xs text-[var(--ink-muted)]">
            O organizador pode preencher na aba Organizador
          </span>
        </div>
      )}
    </section>
  );
}
