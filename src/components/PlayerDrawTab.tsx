import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  Search,
  Shield,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { playDrawSpinCue, playRevealSuccessCue, revealPlayer } from '../lib/api';
import { getDeviceDrawLock, saveDeviceDrawLock } from '../lib/recent';
import type { MatchState, Player, TeamConfig } from '../types';
import { TiraTimeCrest, VestBadge } from './TiraTimeCrest';

function cleanPlayerDisplayName(name: string): string {
  return name
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]+\s*$/u, '')
    .trim();
}

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
  const [confirmingPlayerId, setConfirmingPlayerId] = useState<string | null>(null);
  const [cyclingIdx, setCyclingIdx] = useState(0);
  const [copiedTeam, setCopiedTeam] = useState(false);
  const [revealedResult, setRevealedResult] = useState<{
    team: TeamConfig;
    teammates: Player[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPlayer = useMemo(
    () => match.players.find((p) => p.id === selectedPlayerId) ?? null,
    [match.players, selectedPlayerId]
  );

  // When organizer enables "1 jogador por celular", keep track of the already-revealed player
  // on this device (automatically resets if a new week / redraw clears player reveals).
  const activeDeviceLock = useMemo(() => {
    if (!match.lockOnePerDevice) return null;
    const saved = getDeviceDrawLock(match.slug);
    if (!saved) return null;
    return match.players.find((p) => p.id === saved.playerId && p.revealed) ?? null;
  }, [match.lockOnePerDevice, match.slug, match.players]);

  // Sync revealedResult when selectedPlayer changes or SSE updates arrive
  useEffect(() => {
    setErrorMsg(null);
    setConfirmingPlayerId(null);
    if (selectedPlayerId && !selectedPlayer) {
      onSelectPlayer(null);
    }
    if (
      !selectedPlayer ||
      (!selectedPlayer.revealed && !match.revealAllPublic) ||
      !selectedPlayer.teamId
    ) {
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
  }, [selectedPlayer, match.teams, match.players, match.revealAllPublic]);

  // Mobile-first ergonomics: lock body scroll and dismiss on Escape when confirmation sheet is open
  useEffect(() => {
    if (!confirmingPlayerId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmingPlayerId(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmingPlayerId]);

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
      const delay = elapsed < 1000 ? 110 : elapsed < 1800 ? 170 : elapsed < 2400 ? 260 : 380;
      timerId = window.setTimeout(step, delay);
    };

    timerId = window.setTimeout(step, 110);
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
      const isPlayerRevealed = Boolean((p.revealed || match.revealAllPublic) && p.teamId);
      if (filter === 'pending' && isPlayerRevealed) return false;
      if (filter === 'revealed' && !isPlayerRevealed) return false;
      if (!q) return true;
      const normName = p.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return normName.includes(q) || String(p.listNumber || '').includes(q);
    });
  }, [match.players, match.revealAllPublic, query, filter]);

  const outfieldPlayers = match.balanceGk
    ? filteredPlayers.filter((p) => p.role !== 'gk')
    : filteredPlayers;
  const goalkeepers = match.balanceGk ? filteredPlayers.filter((p) => p.role === 'gk') : [];

  const teamById = useMemo(() => {
    const map = new Map<string, TeamConfig>();
    match.teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [match.teams]);

  const handleDrawReveal = async () => {
    if (!selectedPlayer || isDrawing) return;
    setErrorMsg(null);

    if (activeDeviceLock && activeDeviceLock.id !== selectedPlayer.id) {
      setConfirmingPlayerId(null);
      setErrorMsg(
        `Neste celular você já sorteou o time de ${activeDeviceLock.name}. Peça para ${selectedPlayer.name} sortear no próprio aparelho.`
      );
      return;
    }

    if (selectedPlayer.status === 'doubt' && !match.includeDoubts && !selectedPlayer.teamId) {
      setErrorMsg(
        `${selectedPlayer.name} está marcado como dúvida. Peça ao organizador para confirmar a presença no painel antes do sorteio.`
      );
      return;
    }

    setConfirmingPlayerId(null);
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
      saveDeviceDrawLock(match.slug, res.player.id, res.player.name);
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
    const isSelectedRevealed = Boolean(
      (selectedPlayer.revealed || match.revealAllPublic) && assignedTeam
    );

    const previewTeam = match.teams[cyclingIdx % Math.max(1, match.teams.length)];
    const isBlockedDoubt =
      selectedPlayer.status === 'doubt' && !match.includeDoubts && !selectedPlayer.teamId;
    const isLockedByDevice = Boolean(
      activeDeviceLock && activeDeviceLock.id !== selectedPlayer.id && !isSelectedRevealed
    );
    const isConfirmingIdentity = confirmingPlayerId === selectedPlayer.id && !isDrawing;

    return (
      <section className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-6">
        <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] overflow-hidden">
          {/* Selected player identity bar */}
          <div className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-b border-[var(--chalk-line)] bg-[var(--bg-pitch)] flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#071A12] border border-[var(--chalk-line-strong)] flex items-center justify-center font-display text-lg sm:text-xl font-bold text-[var(--gold-trophy)] tabular-nums shrink-0">
                {selectedPlayer.listNumber ?? '•'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h2 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-tight text-[var(--ink-chalk)] truncate">
                    {selectedPlayer.name}
                  </h2>
                  <span
                    className={`rounded-md px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-semibold ${
                      selectedPlayer.role === 'gk'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'bg-[#071A12]/70 text-[var(--ink-sage)] border border-[var(--chalk-line)]'
                    }`}
                  >
                    {selectedPlayer.role === 'gk' ? 'Goleiro' : 'Linha'}
                  </span>
                  {selectedPlayer.isGuest && (
                    <span className="rounded-md px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-medium bg-sky-500/15 text-sky-200 border border-sky-400/25">
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
              className="tappable hover-surface h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--chalk-line)] bg-[#071A12]/70 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[var(--ink-sage)] shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Trocar jogador</span>
            </button>
          </div>

          {/* Draw Stage OR Revealed Team Card */}
          {isDrawing || !isSelectedRevealed || !assignedTeam ? (
            <div
              className="relative px-3.5 pt-4 pb-6 sm:px-5 sm:pt-8 sm:pb-10 text-center overflow-hidden border-t border-[var(--chalk-line)]"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse 74% 56% at 50% 22%, rgba(234, 179, 8, 0.2), rgba(16, 185, 129, 0.11) 48%, transparent 78%), radial-gradient(circle at 50% 100%, rgba(6, 22, 15, 0.65), transparent 62%)'
              }}
            >
              <div className="relative z-10 flex flex-col items-center">
                {/* Dedicated upper orb stage */}
                <div className="relative w-full max-w-md h-36 sm:h-52 flex items-center justify-center">
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

                  {/* Outer spinning radar aura when drawing */}
                  {isDrawing && (
                    <div
                      aria-hidden="true"
                      className="orb-radar pointer-events-none absolute w-36 h-36 sm:w-48 sm:h-48 rounded-full"
                      style={{
                        background: previewTeam
                          ? `conic-gradient(from 0deg, transparent 0%, ${previewTeam.color} 50%, transparent 100%)`
                          : 'conic-gradient(from 0deg, transparent 0%, rgba(234, 179, 8, 0.8) 50%, transparent 100%)',
                        filter: 'blur(3px)',
                        opacity: 0.75
                      }}
                    />
                  )}

                  {/* Draw Capsule / Bolinha */}
                  <div
                    role={!isDrawing && !isBlockedDoubt && !isLockedByDevice ? 'button' : undefined}
                    tabIndex={!isDrawing && !isBlockedDoubt && !isLockedByDevice ? 0 : undefined}
                    onClick={() => {
                      if (!isDrawing && !isBlockedDoubt && !isLockedByDevice) {
                        setErrorMsg(null);
                        setConfirmingPlayerId(selectedPlayer.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isDrawing && !isBlockedDoubt && !isLockedByDevice) {
                        e.preventDefault();
                        setErrorMsg(null);
                        setConfirmingPlayerId(selectedPlayer.id);
                      }
                    }}
                    title={!isDrawing ? 'Toque para tirar bolinha' : undefined}
                    aria-label={!isDrawing ? `Tirar bolinha para ${selectedPlayer.name}` : 'Sorteando time'}
                    className={`relative z-10 w-28 h-28 sm:w-40 sm:h-40 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-200 select-none ${
                      isDrawing
                        ? 'orb-drawing border-[var(--gold-trophy)] bg-gradient-to-b from-[#184834] via-[#0D2D20] to-[#05160E] shadow-[0_0_36px_rgba(234,179,8,0.4)]'
                        : 'orb-idle cursor-pointer border-[var(--gold-trophy)]/75 bg-gradient-to-b from-[#164230] to-[#081F15] hover:scale-105 hover:border-[var(--gold-trophy)] active:scale-95 shadow-[0_0_24px_rgba(234,179,8,0.22)]'
                    }`}
                    style={
                      isDrawing && previewTeam
                        ? {
                            borderColor: previewTeam.borderColor,
                            boxShadow: `0 0 36px ${previewTeam.color}88, inset 0 0 20px ${previewTeam.color}55`
                          }
                        : undefined
                    }
                  >
                    {isDrawing && previewTeam ? (
                      <div className="flex flex-col items-center gap-1 sm:gap-1.5 [backface-visibility:visible]">
                        <VestBadge team={previewTeam} size="md" />
                        <span className="font-display text-base sm:text-xl font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                          {previewTeam.shortName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                        <TiraTimeCrest className="w-11 h-11 sm:w-16 sm:h-16" />
                        <span className="text-[11px] sm:text-xs font-bold text-[var(--gold-trophy)] tracking-wide">
                          Tirar time
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status headings */}
                <h3 className="mt-2.5 sm:mt-3 font-display text-xl sm:text-3xl font-bold uppercase text-[var(--ink-chalk)] tracking-tight">
                  {isDrawing ? (
                    `Sorteando time de ${cleanPlayerDisplayName(selectedPlayer.name)}...`
                  ) : isBlockedDoubt ? (
                    'Presença em dúvida'
                  ) : (
                    'Tire sua bolinha da urna'
                  )}
                </h3>

                <p className="mt-1 sm:mt-1.5 max-w-[42ch] text-xs sm:text-sm text-[#D4E4DA] leading-relaxed font-medium">
                  {isDrawing ? (
                    'Girando a urna com os coletes oficiais da pelada...'
                  ) : isBlockedDoubt ? (
                    `Você está marcado como dúvida${selectedPlayer.note ? ` (${selectedPlayer.note})` : ''}. Assim que o organizador confirmar você na lista, o sorteio libera.`
                  ) : (
                    'Toque na bolinha ou no botão abaixo para tirar sua bolinha da urna e descobrir seu time hoje.'
                  )}
                </p>

                {isLockedByDevice && activeDeviceLock && (
                  <div
                    role="alert"
                    className="mt-3 sm:mt-4 max-w-md rounded-xl border border-amber-400/35 bg-amber-950/60 px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-amber-100 text-left space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <span>
                        Trava ativa neste aparelho: você já tirou o time de{' '}
                        <strong className="text-white">{activeDeviceLock.name}</strong>.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(activeDeviceLock.id)}
                      className="tappable h-8 px-3 rounded-lg border border-amber-300/35 bg-[#071A12]/70 text-xs font-semibold text-amber-100 hover:bg-[#071A12]"
                    >
                      Voltar para {activeDeviceLock.name}
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="mt-3 sm:mt-4 max-w-md rounded-xl border border-amber-400/35 bg-amber-950/60 px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-amber-100 flex items-start gap-2 text-left"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs sm:max-w-md justify-center">
                  <button
                    type="button"
                    disabled={isDrawing || isBlockedDoubt || isLockedByDevice}
                    onClick={() => {
                      setErrorMsg(null);
                      setConfirmingPlayerId(selectedPlayer.id);
                    }}
                    className="btn-gold tappable w-full sm:w-auto min-w-[240px] h-12 px-6 rounded-xl text-base font-black text-[#06160F] inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <span className="text-[#06160F] font-black">
                      {isDrawing ? 'Sorteando...' : 'Tirar Bolinha da Urna'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Simple Revealed Team Card — full team formation suspense stays in the Times tab */
            <div className="card-reveal p-4 sm:p-6 space-y-3.5 sm:space-y-4">
              <div
                className="rounded-2xl p-4 sm:p-6 border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 shadow-xl"
                style={{
                  backgroundColor: assignedTeam.color,
                  color: assignedTeam.textColor,
                  borderColor: assignedTeam.borderColor
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#071A12] border border-white/20 flex items-center justify-center shrink-0 shadow-md">
                    <VestBadge team={assignedTeam} size="lg" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-85 block mb-0.5">
                      Sua escalação oficial
                    </span>
                    <h3 className="font-display text-2xl sm:text-4xl font-extrabold uppercase leading-none truncate">
                      {assignedTeam.name}
                    </h3>
                    <p className="text-xs sm:text-sm font-semibold opacity-95 mt-1">
                      {selectedPlayer.name}, você joga no {assignedTeam.name} hoje!
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs sm:text-sm font-bold self-start sm:self-center shadow-inner shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{selectedPlayer.role === 'gk' ? 'Goleiro do Time' : 'Jogador de Linha'}</span>
                </div>
              </div>

              {/* Teammates preview for social excitement */}
              {revealedResult?.teammates && revealedResult.teammates.length > 0 ? (
                <div className="rounded-xl pitch-inset border border-[var(--chalk-line)] p-3 sm:p-3.5 text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink-sage)]">
                    <span>Colegas já sorteados no {assignedTeam.name}:</span>
                    <span className="font-mono text-[var(--gold-trophy)]">{revealedResult.teammates.length} atletas</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {revealedResult.teammates.map((tm) => (
                      <span
                        key={tm.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold bg-[#071A12]/85 border border-[var(--chalk-line)] text-[var(--ink-chalk)]"
                      >
                        <span className="font-mono text-[var(--gold-trophy)]">#{tm.listNumber ?? '•'}</span>
                        <span>{tm.name}</span>
                        {tm.role === 'gk' && (
                          <span className="text-[10px] text-amber-300 font-semibold">(GOL)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl pitch-inset border border-[var(--chalk-line)] p-3 text-center text-xs text-[var(--ink-sage)]">
                  Você é o 1º atleta sorteado para o <strong className="text-[var(--ink-chalk)]">{assignedTeam.name}</strong>! Seus companheiros vão aparecendo aqui conforme tiram a bolinha.
                </div>
              )}

              <div className="pt-2 border-t border-[var(--chalk-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const shareText = `⚽ Tirei minha bolinha no SorteioFC e caí no *${assignedTeam.name}*! Bora pro jogo!`;
                      navigator.clipboard.writeText(shareText).catch(() => {});
                      setCopiedTeam(true);
                      setTimeout(() => setCopiedTeam(false), 2000);
                    }}
                    className="tappable hover-surface h-11 px-3.5 rounded-xl border border-[var(--chalk-line)] bg-[#071A12]/80 text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center justify-center gap-1.5"
                  >
                    {copiedTeam ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />}
                    <span>{copiedTeam ? 'Copiado p/ WhatsApp!' : 'Copiar meu time'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onGoToTeams}
                    className="tappable hover-gold h-11 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    <span>Ver Prancheta</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Sheet / Centered Modal Confirmation */}
        {isConfirmingIdentity && (() => {
          const cleanName = cleanPlayerDisplayName(selectedPlayer.name);
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-player-title"
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
              onClick={() => setConfirmingPlayerId(null)}
            >
              <div
                className="bottom-sheet-slide w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-t-2 sm:border-2 border-[var(--gold-trophy)]/50 bg-gradient-to-b from-[#0F3023] via-[#092218] to-[#04120C] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 text-center shadow-[0_-16px_48px_rgba(0,0,0,0.85)] sm:shadow-2xl space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile handle pull bar */}
                <div className="w-12 h-1 rounded-full bg-white/25 mx-auto -mt-1 mb-1 sm:hidden" />

                {/* Header Icon + Question */}
                <div className="space-y-2">
                  <div className="w-13 h-13 rounded-2xl bg-[var(--gold-trophy)]/20 border-2 border-[var(--gold-trophy)]/50 text-[var(--gold-trophy)] flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                    <UserCheck className="w-7 h-7" aria-hidden="true" />
                  </div>

                  <h4
                    id="confirm-player-title"
                    className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight text-white leading-tight"
                  >
                    Você é o {cleanName || selectedPlayer.name}?
                  </h4>
                  <p className="text-xs sm:text-sm text-[#D4E4DA] leading-relaxed max-w-[34ch] mx-auto font-medium">
                    Confirme para abrir a urna e descobrir em qual time você vai jogar hoje.
                  </p>
                </div>

                {/* Clean, high-contrast Player Identity Card */}
                <div className="rounded-2xl border border-[var(--gold-trophy)]/35 bg-[#051810]/90 p-3.5 sm:p-4 text-left space-y-2.5 shadow-inner">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-display text-lg sm:text-xl font-black flex items-center justify-center shrink-0 shadow-md">
                        #{selectedPlayer.listNumber ?? '•'}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-[var(--gold-trophy)] uppercase tracking-wider block">
                          Atleta confirmado na lista
                        </span>
                        <span className="font-bold text-base sm:text-lg text-white truncate block">
                          {selectedPlayer.name}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold border shrink-0 ${
                        selectedPlayer.role === 'gk'
                          ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
                          : 'bg-[#071A12] text-[#E2EBE5] border-[var(--chalk-line)]'
                      }`}
                    >
                      {selectedPlayer.role === 'gk' ? '🧤 Goleiro' : '⚽ Linha'}
                    </span>
                  </div>

                  {(selectedPlayer.note || selectedPlayer.isGuest || match.meta.feeAmount > 0) && (
                    <div className="pt-2 border-t border-[var(--chalk-line)] flex items-center justify-between text-xs text-[#E2EBE5]">
                      <span className="text-[#A7C5B5] truncate">
                        {selectedPlayer.note
                          ? `Obs: ${selectedPlayer.note}`
                          : selectedPlayer.isGuest
                            ? 'Convidado na lista'
                            : 'Pelada confirmada'}
                      </span>
                      {match.meta.feeAmount > 0 && (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-300 shrink-0">
                          <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                          R$ {match.meta.feeAmount}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons in thumb zone with clear hierarchy */}
                <div className="pt-1 flex flex-col gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={handleDrawReveal}
                    className="btn-gold tappable w-full h-12 sm:h-13 rounded-xl text-base font-black text-[#06160F] inline-flex items-center justify-center gap-2 shadow-xl cursor-pointer"
                  >
                    <UserCheck className="w-5 h-5 text-[#06160F] shrink-0" aria-hidden="true" />
                    <span className="text-[#06160F] font-black">Sim, sou eu · Tirar Bolinha</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingPlayerId(null);
                      onSelectPlayer(null);
                    }}
                    className="tappable hover-surface w-full h-10 sm:h-11 rounded-xl border border-[var(--chalk-line)] bg-[#071A12]/90 text-xs sm:text-sm font-semibold text-[#B2CCC0] hover:text-white cursor-pointer"
                  >
                    Não sou eu (trocar de jogador)
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </section>
    );
  }

  // Initial Screen: Simple, clean Player List to pick your own name
  return (
    <section className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      <div className="rounded-2xl panel-hero border border-[var(--chalk-line)] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-[var(--ink-chalk)]">
              Quem é você na lista?
            </h2>
            <p className="text-sm text-[var(--ink-sage)] mt-0.5">
              {match.revealAllPublic
                ? 'As vagas foram preenchidas automaticamente! Confira seu time ao lado do seu nome.'
                : 'Toque no seu nome abaixo para tirar sua bolinha na urna e descobrir seu time.'}
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

        {activeDeviceLock && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-950/45 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
              <span>
                Trava por celular ativa: você já tirou o time de{' '}
                <strong className="text-white">{activeDeviceLock.name}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectPlayer(activeDeviceLock.id)}
              className="tappable h-7 px-2.5 rounded-lg border border-amber-300/35 bg-[#071A12]/70 text-[11px] font-bold text-amber-100 hover:bg-[#071A12]"
            >
              Ver meu time
            </button>
          </div>
        )}
      </div>

      {/* Outfield Players */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)]">
            {match.balanceGk ? 'Jogadores de Linha' : 'Jogadores da Lista'}
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
              const isRevealed = Boolean((player.revealed || match.revealAllPublic) && team);
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

                  {isRevealed && team ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border"
                      style={{
                        backgroundColor: team.color,
                        color: team.textColor,
                        borderColor: team.borderColor
                      }}
                    >
                      {team.name}
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
              const isRevealed = Boolean((gk.revealed || match.revealAllPublic) && team);
              const isDoubt = gk.status === 'doubt' && !match.includeDoubts && !gk.teamId;

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

                  {isRevealed && team ? (
                    <span
                      className="shrink-0 inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold border"
                      style={{
                        backgroundColor: team.color,
                        color: team.textColor,
                        borderColor: team.borderColor
                      }}
                    >
                      {team.name}
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
