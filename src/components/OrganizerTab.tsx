import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Calendar,
  Check,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Shuffle,
  Trash2,
  Upload,
  Users
} from 'lucide-react';
import {
  addPlayer,
  executeDraw,
  importMatchList,
  previewWhatsAppParse,
  updateMatchSettings,
  updatePlayer,
  verifyAdminAuth,
  type AdminAuth
} from '../lib/api';
import type { MatchState, ParsePreviewResult, PlayerStatus, TeamConfig } from '../types';
import { VestBadge, FORMATION_LAYOUTS, getInitials } from './TiraTimeCrest';

const MIN_PIN = 4;

const COLOR_PRESETS: Array<Pick<TeamConfig, 'shortName' | 'color' | 'textColor' | 'borderColor'>> = [
  { shortName: 'Ouro', color: '#EAB308', textColor: '#0A1E15', borderColor: '#FDE047' },
  { shortName: 'Preto', color: '#1C221F', textColor: '#F5F2E8', borderColor: '#717E77' },
  { shortName: 'Branco', color: '#F5F2E8', textColor: '#0A1E15', borderColor: '#D6D1C2' },
  { shortName: 'Azul', color: '#2563EB', textColor: '#F5F2E8', borderColor: '#60A5FA' },
  { shortName: 'Vermelho', color: '#DC2626', textColor: '#F5F2E8', borderColor: '#F87171' },
  { shortName: 'Verde', color: '#10B981', textColor: '#071A12', borderColor: '#34D399' }
];

function TacticalFormationPreview({
  teams,
  outfieldCap,
  players,
  eligibleCount
}: {
  teams: TeamConfig[];
  outfieldCap: number;
  players: import('../types').Player[];
  eligibleCount: number;
}) {
  const coords = FORMATION_LAYOUTS[outfieldCap] || FORMATION_LAYOUTS[6];
  const totalSlots = teams.length * (outfieldCap + 1);
  const diffSlots = totalSlots - eligibleCount;

  const gridClass =
    teams.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : teams.length === 4
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-3 pt-2">
      {/* Mathematical & Tactical Explanation Banner */}
      <div className="rounded-xl border border-[var(--gold-trophy)]/30 bg-[#082015] p-3.5 sm:p-4 text-xs sm:text-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2">
            <span className="font-display uppercase tracking-wider text-xs font-bold text-[var(--gold-trophy)]">
              Prancheta Tática:
            </span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/40 text-[var(--gold-trophy)] font-bold">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>1 no Gol (Goleiro)</span>
            </div>
            <span className="text-base font-bold text-[var(--ink-sage)]">+</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-[var(--ink-chalk)] font-bold">
              <span>{outfieldCap} na Linha (Jogadores de Campo)</span>
            </div>
            <span className="text-base font-bold text-[var(--ink-sage)]">=</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-extrabold">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>{outfieldCap + 1} Atletas por Equipe</span>
            </div>
          </div>

          <div className="text-xs text-[var(--ink-muted)]">
            Total da pelada:{' '}
            <strong className="text-[var(--ink-chalk)]">
              {teams.length} times × {outfieldCap + 1} = {totalSlots} vagas no sorteio
            </strong>
          </div>
        </div>

        {/* Comparison with Current WhatsApp Roster */}
        <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-[rgba(245,242,232,0.08)] text-[11px] sm:text-xs">
          <span className="text-[var(--ink-sage)]">
            Elenco ativo na lista:{' '}
            <strong className="text-[var(--ink-chalk)]">{eligibleCount} confirmados</strong>.
          </span>
          {players.length === 0 ? (
            <span className="text-[var(--ink-muted)] font-medium">
              Adicione jogadores na lista abaixo para preencher as {totalSlots} vagas.
            </span>
          ) : diffSlots === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>A lista preenche perfeitamente as {totalSlots} vagas dos times.</span>
            </span>
          ) : diffSlots > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Faltam {diffSlots} atletas para fechar as {totalSlots} vagas ({eligibleCount}/{totalSlots}).</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Há {Math.abs(diffSlots)} atleta(s) excedentes na lista de espera.</span>
            </span>
          )}
        </div>
      </div>

      {/* Tactically positioned pitch for each team */}
      <div className={`grid ${gridClass} gap-3`}>
        {teams.map((team, tIdx) => {
          const teamPlayers = players.filter((p) => p.teamId === team.id);
          const gks = teamPlayers.filter((p) => p.role === 'gk');
          const outfields = teamPlayers.filter((p) => p.role !== 'gk');

          return (
            <div
              key={team.id || tIdx}
              className="rounded-xl border border-[var(--chalk-line)] bg-[#071A12] p-3 space-y-2 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <VestBadge team={team} size="sm" />
                  <span className="text-sm font-bold text-[var(--ink-chalk)] truncate">
                    {team.name}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[var(--ink-sage)] px-2 py-0.5 rounded-md bg-[#0D281D] border border-[var(--chalk-line)] shrink-0">
                  1 GK + {outfieldCap} Linha
                </span>
              </div>

              {/* Pitch Preview SVG */}
              <div className="relative">
                <svg
                  viewBox="0 0 240 136"
                  className="w-full h-28 sm:h-32 rounded-lg bg-[#081F15] border border-[rgba(245,242,232,0.12)] shadow-inner"
                  role="img"
                  aria-label={`Esquema tático do ${team.name}: 1 no gol e ${outfieldCap} na linha`}
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

                  {/* Goalkeeper circle (Gold, inside six-yard box on left) */}
                  {gks.length > 0 ? (
                    <g>
                      <circle cx="22" cy="68" r="10.5" fill="#EAB308" stroke="#071A12" strokeWidth="2" />
                      <text x="22" y="71.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#071A12">
                        {getInitials(gks[0].name)}
                      </text>
                    </g>
                  ) : (
                    <g>
                      <circle cx="22" cy="68" r="10" fill="#EAB308" stroke="#071A12" strokeWidth="1.5" />
                      <text x="22" y="71" textAnchor="middle" fontSize="7" fontWeight="800" fill="#071A12">
                        GOL
                      </text>
                    </g>
                  )}

                  {/* Outfield slots based on selected line cap */}
                  {Array.from({ length: outfieldCap }).map((_, slotIdx) => {
                    const [cx, cy] = coords[slotIdx] || [
                      50 + (slotIdx % 3) * 70,
                      56 + Math.floor(slotIdx / 3) * 26,
                      `L${slotIdx + 1}`
                    ];
                    const player = outfields[slotIdx];

                    if (player) {
                      return (
                        <g key={player.id}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r="10"
                            fill={team.color}
                            stroke={team.borderColor}
                            strokeWidth="2"
                          />
                          <text
                            x={cx}
                            y={cy + 3}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="700"
                            fill={team.textColor}
                          >
                            {getInitials(player.name)}
                          </text>
                        </g>
                      );
                    }

                    return (
                      <g key={`slot-${slotIdx}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r="9.5"
                          fill="#0D281D"
                          stroke={team.borderColor}
                          strokeDasharray="2.5 2.5"
                          strokeWidth="1.2"
                        />
                        <text
                          x={cx}
                          y={cy + 2.8}
                          textAnchor="middle"
                          fontSize="7"
                          fontWeight="700"
                          fill="rgba(245,242,232,0.85)"
                        >
                          L{slotIdx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Bottom summary */}
              <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)] pt-1 border-t border-[var(--chalk-line)]">
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3 h-3" />1 no Gol
                </span>
                <span>{outfieldCap} na Linha</span>
                <span className="font-bold text-[var(--ink-chalk)]">Total: {outfieldCap + 1} atletas</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface OrganizerTabProps {
  match: MatchState;
  adminAuth?: AdminAuth;
  onAuthenticated: (token: string, pin: string, nextMatch: MatchState) => void;
  onMatchUpdated: (nextMatch: MatchState) => void;
  onGoHome: () => void;
  onToast: (message: string) => void;
}

export function OrganizerTab({
  match,
  adminAuth,
  onAuthenticated,
  onMatchUpdated,
  onGoHome,
  onToast
}: OrganizerTabProps) {
  const [pinInput, setPinInput] = useState('');
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [rawText, setRawText] = useState(match.rawList);
  const [preview, setPreview] = useState<ParsePreviewResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Admin PIN management state
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);
  const [showCurrentPin, setShowCurrentPin] = useState(false);

  // Room metadata editor state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editGroupName, setEditGroupName] = useState(match.groupName);
  const [editDateLabel, setEditDateLabel] = useState(match.meta.dateLabel);
  const [editTimeLabel, setEditTimeLabel] = useState(match.meta.timeLabel);
  const [editFeeAmount, setEditFeeAmount] = useState(
    match.meta.feeAmount > 0 ? String(match.meta.feeAmount) : ''
  );

  // Safety confirmation dialog for draw actions
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    action: 'run_full_draw' | 'open_live_urn';
    actionKey: string;
    title: string;
    description: string;
    successMsg: string;
  } | null>(null);

  // Add player / fill open slot form
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'outfield' | 'gk'>('outfield');
  const [newSlot, setNewSlot] = useState<string>(
    match.openSlots[0] ? String(match.openSlots[0].listNumber) : ''
  );
  const [newGuest, setNewGuest] = useState(false);

  useEffect(() => {
    setRawText(match.rawList);
  }, [match.id, match.rawList]);

  useEffect(() => {
    setEditGroupName(match.groupName);
    setEditDateLabel(match.meta.dateLabel);
    setEditTimeLabel(match.meta.timeLabel);
    setEditFeeAmount(match.meta.feeAmount > 0 ? String(match.meta.feeAmount) : '');
  }, [match.id, match.groupName, match.meta.dateLabel, match.meta.timeLabel, match.meta.feeAmount]);

  useEffect(() => {
    if (match.openSlots[0]) {
      setNewSlot(String(match.openSlots[0].listNumber));
    } else {
      setNewSlot('');
    }
  }, [match.openSlots]);

  // Debounced live preview while typing/pasting WhatsApp list
  useEffect(() => {
    if (!match.isAdmin || !rawText.trim()) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      previewWhatsAppParse(rawText)
        .then(setPreview)
        .catch(() => {});
    }, 240);
    return () => window.clearTimeout(timer);
  }, [rawText, match.isAdmin]);

  const paidStats = useMemo(() => {
    const active = match.players.filter((p) => p.status !== 'out');
    const paidCount = active.filter((p) => p.paid).length;
    const totalValue = active.length * match.meta.feeAmount;
    const paidValue = paidCount * match.meta.feeAmount;
    return { paidCount, activeCount: active.length, paidValue, totalValue };
  }, [match.players, match.meta.feeAmount]);

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

  const ensureOutfieldCapPersisted = async (
    updated: MatchState,
    targetCap: number
  ): Promise<MatchState> => {
    if (Number(updated.teams[0]?.outfieldCap) === targetCap) {
      return updated;
    }
    const patchedTeams = updated.teams.map((t) => ({ ...t, outfieldCap: targetCap }));
    try {
      let saved = await updateMatchSettings(
        match.slug,
        { teams: patchedTeams },
        effectiveAuth
      );
      for (const team of patchedTeams) {
        const teamOutfielders = saved.players.filter(
          (p) => p.teamId === team.id && p.role !== 'gk'
        );
        if (teamOutfielders.length > targetCap) {
          for (const extraPlayer of teamOutfielders.slice(targetCap)) {
            saved = await updatePlayer(
              match.slug,
              extraPlayer.id,
              { teamId: null, revealed: false },
              effectiveAuth
            );
          }
        }
      }
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

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = newPinValue.trim();
    if (!cleanPin || cleanPin.length < MIN_PIN) {
      setPinFeedback(`O PIN precisa ter pelo menos ${MIN_PIN} caracteres.`);
      return;
    }
    setPinFeedback(null);
    setBusyAction('save-pin');
    try {
      const updated = await updateMatchSettings(match.slug, { adminPin: cleanPin }, effectiveAuth);
      const token = updated.adminToken || match.adminToken || adminAuth?.token || '';
      onAuthenticated(token, cleanPin, updated);
      setIsChangingPin(false);
      setNewPinValue('');
      setShowCurrentPin(true);
      onToast(`PIN do organizador alterado para "${cleanPin}". Anote seu novo PIN!`);
    } catch (err) {
      setPinFeedback(err instanceof Error ? err.message : 'Erro ao alterar PIN.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTriggerDrawAction = (
    action: 'run_full_draw' | 'open_live_urn',
    actionKey: string,
    title: string,
    description: string,
    successMsg: string
  ) => {
    if (hasAssignedPlayers) {
      setPendingConfirmAction({
        action,
        actionKey: actionKey as 'open-live-urn' | 'run-full-draw',
        title,
        description,
        successMsg
      });
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

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await verifyAdminAuth(match.slug, { pin: pinInput.trim() });
      onAuthenticated(res.adminToken, pinInput.trim(), res.match);
      onToast('Painel do organizador desbloqueado.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'PIN incorreto.');
    } finally {
      setAuthLoading(false);
    }
  };

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

  if (!match.isAdmin) {
    return (
      <section className="max-w-md mx-auto px-4 py-8">
        <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="w-12 h-12 rounded-xl bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/35 flex items-center justify-center text-[var(--gold-trophy)]">
              <KeyRound className="w-6 h-6" />
            </div>
            <span className="rounded-lg bg-[#071A12] border border-[var(--chalk-line)] px-2.5 py-1 font-mono text-xs text-[var(--ink-sage)]">
              {match.slug}
            </span>
          </div>

          <h2 className="mt-4 font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
            Área do Organizador · {match.groupName}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-sage)] leading-relaxed">
            Digite o PIN definido na criação da sala para configurar os times, importar a lista e controlar os pagamentos.
          </p>

          <form onSubmit={handlePinSubmit} className="mt-5 space-y-3">
            <div>
              <label htmlFor="admin-pin-input" className="block text-xs font-semibold text-[var(--ink-sage)] mb-1.5">
                PIN do organizador
              </label>
              <div className="relative">
                <input
                  id="admin-pin-input"
                  type={showLoginPin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Digite o PIN da sala"
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#071A12] border border-[var(--chalk-line)] text-base text-[var(--ink-chalk)] tabular-nums focus:border-[var(--gold-trophy)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPin((v) => !v)}
                  aria-label={showLoginPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
                >
                  {showLoginPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <p role="alert" className="text-xs font-medium text-red-300">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading || !pinInput.trim()}
              className="tappable hover-gold w-full h-11 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
            >
              {authLoading ? 'Verificando...' : 'Entrar como Organizador'}
            </button>
          </form>

          <button
            type="button"
            onClick={onGoHome}
            className="tappable hover-surface mt-3 w-full h-10 rounded-xl border border-[var(--chalk-line)] bg-[#071A12] text-xs font-semibold text-[var(--ink-sage)] inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para Minhas Peladas
          </button>
        </div>
      </section>
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

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => el.focus({ preventScroll: true }), 260);
  };

  const handleSaveMatchInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editGroupName.trim().length < 2) {
      onToast('O nome da pelada precisa ter pelo menos 2 letras.');
      return;
    }
    const numericFee = Number(editFeeAmount.replace(',', '.').replace(/[^\d.]/g, ''));
    const cleanFee = editFeeAmount.trim() && Number.isFinite(numericFee) && numericFee > 0 ? numericFee : 0;
    await runAction(
      'save-info',
      async () => {
        const updated = await updateMatchSettings(
          match.slug,
          {
            groupName: editGroupName.trim(),
            dateLabel: editDateLabel.trim(),
            timeLabel: editTimeLabel.trim(),
            feeAmount: cleanFee,
            feeLabel: cleanFee > 0 ? `R$ ${cleanFee}` : ''
          },
          effectiveAuth
        );
        setIsEditingInfo(false);
        return updated;
      },
      'Informações da pelada atualizadas!'
    );
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await runAction(
      'add-player',
      () =>
        addPlayer(
          match.slug,
          {
            name: newName.trim(),
            role: newRole,
            listNumber: newSlot ? Number(newSlot) : null,
            isGuest: newGuest,
            autoAssign: match.drawStatus === 'drawn',
            revealNow: false
          },
          effectiveAuth
        ),
      `${newName.trim()} adicionado à lista.`
    );
    setNewName('');
    setNewGuest(false);
  };

  const handleTeamUpdate = (index: number, patch: Partial<TeamConfig>) => {
    const nextTeams = match.teams.map((t, i) => (i === index ? { ...t, ...patch } : t));
    runAction('team-update', () => updateMatchSettings(match.slug, { teams: nextTeams }, effectiveAuth));
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-5 space-y-6">
      {/* 1. Room Info, Share & PIN */}
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Painel do Organizador · {match.groupName}
            </h2>
            <p className="text-sm text-[var(--ink-sage)]">
              {match.players.length === 0
                ? 'Sala pronta! Adicione a lista de jogadores abaixo e compartilhe o código ou o link com a galera.'
                : 'Mande o link dos jogadores no grupo do WhatsApp para cada um descobrir seu time.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onGoHome}
            className="tappable hover-surface self-start sm:self-auto h-9 px-3 rounded-lg border border-[var(--chalk-line)] bg-[#071A12] text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
            Minhas Peladas / Nova Sala
          </button>
        </div>

        {/* Room Code Bar */}
        <div className="rounded-xl border border-[var(--chalk-line)] bg-[#071A12] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Hash className="w-4 h-4 text-[var(--gold-trophy)] shrink-0" />
            <span className="text-xs text-[var(--ink-sage)]">Código da sala:</span>
            <code className="font-mono text-sm font-bold text-[var(--gold-trophy)] truncate">{match.slug}</code>
          </div>
          <button
            type="button"
            onClick={() => copyText(match.slug, 'Código da sala')}
            className="tappable hover-surface h-8 px-2.5 rounded-lg border border-[var(--chalk-line)] bg-[#0D281D] text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
            Copiar código
          </button>
        </div>

        <div className="border-t border-[var(--chalk-line)] pt-3 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--chalk-line)]">
          <button
            type="button"
            onClick={() => copyText(playerShareUrl, 'Link dos jogadores')}
            className="tappable hover-surface py-2.5 sm:pr-4 flex items-center justify-between gap-2 text-left rounded-lg sm:rounded-none"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--gold-trophy)] flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                Copiar Link para o Grupo (Jogadores)
              </div>
              <div className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
                Envie no WhatsApp para a galera tirar a bolinha na urna
              </div>
            </div>
            <Copy className="w-4 h-4 text-[var(--ink-sage)] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => copyText(adminShareUrl, 'Link direto do organizador')}
            className="tappable hover-surface py-2.5 sm:pl-4 flex items-center justify-between gap-2 text-left rounded-lg sm:rounded-none"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Seu Link Direto Admin (sem digitar PIN)
              </div>
              <div className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
                Guarde nas suas mensagens salvas para entrar direto
              </div>
            </div>
            <Copy className="w-4 h-4 text-[var(--ink-sage)] shrink-0" />
          </button>
        </div>

        {/* Match Info Editor (Name, Date, Time, Fee) */}
        <div className="border-t border-[var(--chalk-line)] pt-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#071A12] p-3 rounded-xl border border-[var(--chalk-line)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/30 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--ink-chalk)] truncate">{match.groupName}</div>
                <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                  {[match.meta.dateLabel, match.meta.timeLabel, match.meta.feeLabel].filter(Boolean).join(' · ') ||
                    'Sem dia, horário ou valor definidos ainda'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingInfo((v) => !v)}
              className="tappable hover-surface self-start sm:self-auto h-8 px-3 rounded-lg border border-[var(--chalk-line)] bg-[#0D281D] text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5 shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
              <span>{isEditingInfo ? 'Cancelar' : 'Editar Dados da Pelada'}</span>
            </button>
          </div>

          {isEditingInfo && (
            <form
              onSubmit={handleSaveMatchInfo}
              className="rounded-xl border border-[var(--gold-trophy)]/40 bg-[#092419] p-3.5 sm:p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">
                    Nome da pelada
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-sm text-[var(--ink-chalk)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">Dia / Data</label>
                  <input
                    type="text"
                    maxLength={40}
                    value={editDateLabel}
                    onChange={(e) => setEditDateLabel(e.target.value)}
                    placeholder="Ex: Quinta-feira"
                    className="w-full h-9 px-3 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-sm text-[var(--ink-chalk)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">Horário</label>
                    <input
                      type="text"
                      maxLength={20}
                      value={editTimeLabel}
                      onChange={(e) => setEditTimeLabel(e.target.value)}
                      placeholder="21:00"
                      className="w-full h-9 px-2.5 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-sm text-[var(--ink-chalk)] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">Valor (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editFeeAmount}
                      onChange={(e) => setEditFeeAmount(e.target.value)}
                      placeholder="10"
                      className="w-full h-9 px-2.5 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-sm text-[var(--ink-chalk)] tabular-nums"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busyAction !== null || editGroupName.trim().length < 2}
                  className="tappable hover-gold h-9 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#071A12] font-bold text-xs disabled:opacity-50"
                >
                  {busyAction === 'save-info' ? 'Salvando...' : 'Salvar Dados'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(false)}
                  className="tappable hover-surface h-9 px-3 rounded-lg border border-[var(--chalk-line)] text-xs text-[var(--ink-muted)]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Organizer PIN Management Bar */}
        <div className="border-t border-[var(--chalk-line)] pt-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#071A12] p-3 rounded-xl border border-[var(--chalk-line)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/30 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--ink-chalk)] flex items-center gap-1.5">
                  <span>PIN do Organizador:</span>
                  <span className="font-mono text-sm text-[var(--gold-trophy)] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#0D281D]">
                    {showCurrentPin ? currentAdminPin : '••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPin((v) => !v)}
                    className="text-[var(--ink-muted)] hover:text-[var(--ink-chalk)] transition-colors p-1"
                    title={showCurrentPin ? 'Ocultar PIN' : 'Visualizar PIN'}
                    aria-label={showCurrentPin ? 'Ocultar PIN' : 'Visualizar PIN'}
                  >
                    {showCurrentPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                  Guarde este PIN para acessar o painel em outro celular ou navegador.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsChangingPin((v) => !v);
                setNewPinValue('');
                setPinFeedback(null);
              }}
              className="tappable hover-surface self-start sm:self-auto h-8 px-3 rounded-lg border border-[var(--chalk-line)] bg-[#0D281D] text-xs font-semibold text-[var(--gold-trophy)] inline-flex items-center gap-1.5 shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isChangingPin ? 'Cancelar' : 'Alterar PIN do Organizador'}</span>
            </button>
          </div>

          {/* Change PIN Inline Form */}
          {isChangingPin && (
            <form
              onSubmit={handleSaveNewPin}
              className="rounded-xl border border-[var(--gold-trophy)]/40 bg-[#092419] p-3.5 sm:p-4 space-y-3 animate-in fade-in"
            >
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--gold-trophy)]">
                  Definir Novo PIN do Organizador
                </h4>
                <p className="text-xs text-[var(--ink-sage)] mt-0.5">
                  Defina um novo PIN próprio para sua pelada (mínimo {MIN_PIN} caracteres).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newPinValue}
                  onChange={(e) => setNewPinValue(e.target.value)}
                  placeholder="Novo PIN (ex: 2026)"
                  className="h-9 px-3 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-sm font-mono text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] outline-none w-48"
                />

                <button
                  type="submit"
                  disabled={busyAction !== null || newPinValue.trim().length < MIN_PIN}
                  className="tappable hover-gold h-9 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#071A12] font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busyAction === 'save-pin' ? 'Salvando...' : 'Salvar Novo PIN'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPin(false);
                    setNewPinValue('');
                    setPinFeedback(null);
                  }}
                  className="tappable hover-surface h-9 px-3 rounded-lg border border-[var(--chalk-line)] bg-transparent text-xs text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
                >
                  Cancelar
                </button>
              </div>

              {pinFeedback && (
                <p role="alert" className="text-xs font-medium text-amber-300">
                  {pinFeedback}
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Empty Roster Onboarding Callout */}
      {match.players.length === 0 && (
        <div className="rounded-2xl border border-[var(--gold-trophy)]/45 bg-[var(--gold-trophy)]/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-[var(--gold-trophy)]/20 border border-[var(--gold-trophy)]/40 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
              <ClipboardList className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)]">
                Sua sala começou limpa! Adicione a lista
              </h3>
              <p className="text-xs sm:text-sm text-[var(--ink-sage)] mt-0.5">
                Nenhum dado aleatório foi gerado. Cole a lista do WhatsApp ou cadastre os jogadores manualmente abaixo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollToElement('whatsapp-list-input')}
              className="tappable hover-gold h-9 px-3.5 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-xs inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Colar Lista do WhatsApp
            </button>
            <button
              type="button"
              onClick={() => scrollToElement('quick-add-name')}
              className="tappable hover-surface h-9 px-3.5 rounded-xl border border-[var(--chalk-line-strong)] bg-[#071A12] text-[var(--ink-chalk)] font-semibold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
              Adicionar Manual
            </button>
          </div>
        </div>
      )}

      {/* 2. Draw Configuration & Actions */}
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 sm:p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Configuração & Sorteio
            </h3>
            <p className="text-sm text-[var(--ink-sage)]">
              Defina a quantidade de times e quantos jogadores atuam na linha (+ 1 no gol por time).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            {/* Number of teams */}
            <div className="flex items-center gap-1 bg-[#071A12] p-1 rounded-xl border border-[var(--chalk-line)]">
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
                  className={`tappable h-8 px-3 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                    match.teams.length === count
                      ? 'bg-[var(--gold-trophy)] text-[#071A12] shadow-sm'
                      : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                  }`}
                >
                  {count} Times
                </button>
              ))}
            </div>

            {/* Number of outfield players per team */}
            <div
              className="flex items-center gap-1 bg-[#071A12] p-1 rounded-xl border border-[var(--chalk-line)]"
              role="group"
              aria-label="Jogadores na linha por time"
            >
              <span className="px-2 text-xs font-semibold text-[var(--ink-muted)]">Na linha:</span>
              {[4, 5, 6, 7, 8, 10].map((lineCount) => {
                const isSelected = currentOutfieldCap === lineCount;
                return (
                  <button
                    key={lineCount}
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleChangeOutfieldCap(lineCount)}
                    className={`tappable h-8 px-2.5 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[var(--gold-trophy)] text-[#071A12] shadow-sm'
                        : 'text-[var(--ink-sage)] hover-surface hover:text-[var(--ink-chalk)]'
                    }`}
                  >
                    {lineCount}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tactical Formation Preview (Visual pitch preview showing GK + outfield positions) */}
        <TacticalFormationPreview
          teams={match.teams}
          outfieldCap={currentOutfieldCap}
          players={match.players}
          eligibleCount={eligiblePlayers.length}
        />

        {/* Mode switch */}
        <div className="rounded-xl border border-[var(--chalk-line)] overflow-hidden grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--chalk-line)] bg-[#081F15]">
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
            className={`tappable text-left p-3.5 transition-colors ${
              match.drawMode === 'live_urn'
                ? 'bg-[var(--bg-pitch)]'
                : 'hover-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[var(--ink-chalk)]">
                Urna Ao Vivo (Principal)
              </span>
              {match.drawMode === 'live_urn' && (
                <span className="rounded-full bg-[var(--gold-trophy)] text-[#071A12] px-2 py-0.5 text-xs font-bold shrink-0">
                  Ativo
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--ink-sage)] leading-relaxed">
              Suspense total: cada jogador tira sua bolinha da urna e vê os {match.teams.length} times ({currentOutfieldCap} na linha + 1 no gol) se formando na aba Times.
            </p>
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
            className={`tappable text-left p-3.5 transition-colors ${
              match.drawMode === 'closed_reveal'
                ? 'bg-[var(--bg-pitch)]'
                : 'hover-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[var(--ink-chalk)]">
                Sorteio Pré-Definido (Fechado)
              </span>
              {match.drawMode === 'closed_reveal' && (
                <span className="rounded-full bg-[var(--gold-trophy)] text-[#071A12] px-2 py-0.5 text-xs font-bold shrink-0">
                  Ativo
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--ink-sage)] leading-relaxed">
              Separa os times antecipadamente em segredo e cada jogador abre sua bolinha quando entrar no link.
            </p>
          </button>
        </div>

        {/* Team Names & Colors Customization */}
        <div className="border-t border-[var(--chalk-line)] pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {match.teams.map((team, idx) => (
            <div key={team.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#071A12] border border-white/15 flex items-center justify-center shrink-0">
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
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-base font-semibold"
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
                        ? 'ring-2 ring-[var(--gold-trophy)] ring-offset-2 ring-offset-[#071A12]'
                        : ''
                    }`}
                    style={{ backgroundColor: preset.color, borderColor: preset.borderColor }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Option toggles */}
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() =>
              runAction('balance-gk', () =>
                updateMatchSettings(match.slug, { balanceGk: !match.balanceGk }, effectiveAuth)
              )
            }
            className={`tappable h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 ${
              match.balanceGk
                ? 'border-emerald-400/40 bg-emerald-950/60 text-emerald-200'
                : 'border-[var(--chalk-line)] bg-[#071A12] text-[var(--ink-muted)]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Equilibrar goleiros (1 por time): {match.balanceGk ? 'Sim' : 'Não'}
          </button>

          <button
            type="button"
            onClick={() =>
              runAction('include-doubts', () =>
                updateMatchSettings(match.slug, { includeDoubts: !match.includeDoubts }, effectiveAuth)
              )
            }
            className={`tappable h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 ${
              match.includeDoubts
                ? 'border-amber-400/40 bg-amber-950/60 text-amber-200'
                : 'border-[var(--chalk-line)] bg-[#071A12] text-[var(--ink-muted)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Incluir &quot;dúvida&quot; no sorteio: {match.includeDoubts ? 'Sim' : 'Separados'}
          </button>
        </div>

        {/* Safety Confirmation Dialog for Resetting Draw */}
        {pendingConfirmAction && (
          <div
            role="alertdialog"
            aria-modal="true"
            className="p-4 rounded-xl border-2 border-amber-400/50 bg-amber-950/85 text-amber-100 space-y-3 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="font-bold text-sm text-amber-200">
                  {pendingConfirmAction.title}
                </h5>
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  {pendingConfirmAction.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setPendingConfirmAction(null)}
                className="tappable h-9 px-3.5 rounded-lg border border-amber-400/40 bg-transparent text-xs font-semibold text-amber-200 hover:bg-amber-900/40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
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
                className="tappable h-9 px-4 rounded-lg bg-amber-400 text-amber-950 font-bold text-xs hover:bg-amber-300"
              >
                Sim, confirmar ação
              </button>
            </div>
          </div>
        )}

        {/* Draw Actions Container (Contextual & Clear) */}
        <div className="space-y-4 pt-1">
          {/* Active Mode Execution Box */}
          <div className="rounded-xl border border-[var(--chalk-line)] bg-[#081F15] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--chalk-line)] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--gold-trophy)] animate-pulse" />
                <h4 className="font-display uppercase tracking-wide text-sm font-bold text-[var(--ink-chalk)]">
                  {match.drawMode === 'live_urn'
                    ? 'Ações da Urna Ao Vivo (Modo Ativo)'
                    : 'Ações do Sorteio Fechado (Modo Ativo)'}
                </h4>
              </div>

              <div className="text-xs text-[var(--ink-sage)]">
                Status:{' '}
                <strong className="text-[var(--gold-trophy)] font-bold tabular-nums">
                  {revealedCount} de {eligiblePlayers.length}
                </strong>{' '}
                atletas já {match.drawMode === 'live_urn' ? 'tiraram da urna' : 'revelaram seu time'}
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--ink-sage)] leading-relaxed">
              {match.drawMode === 'live_urn'
                ? 'Neste modo, os jogadores entram pelo link no celular e puxam sua bolinha da urna ao chegar na quadra. A formação dos times ocorre em tempo real na aba Times.'
                : 'Neste modo, os times são sorteados de antemão de forma equilibrada em segredo. Cada atleta abre sua bolinha individualmente quando acessar o link.'}
            </p>

            {/* Action Buttons for Current Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {match.drawMode === 'live_urn' ? (
                <>
                  {/* Primary Live Urn Button */}
                  <div className="rounded-xl border border-[var(--gold-trophy)]/40 bg-[var(--gold-trophy)]/10 p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--gold-trophy)] uppercase tracking-wider">
                        Ação Principal da Urna
                      </div>
                      <p className="text-xs text-[var(--ink-sage)] mt-1 leading-normal">
                        Zera os sorteios anteriores e deixa a urna aberta para o pessoal tirar as bolinhas na chegada.
                      </p>
                    </div>

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
                      className="tappable hover-gold w-full h-11 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className="w-4 h-4 text-[#071A12]" />
                      <span>Zerar e Abrir Urna Ao Vivo</span>
                    </button>
                  </div>

                  {/* Secondary Batch Draw Button */}
                  <div className="rounded-xl border border-[var(--chalk-line)] bg-[#071A12] p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--ink-chalk)] uppercase tracking-wider">
                        Atalho Opcional
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] mt-1 leading-normal">
                        Caso não queira esperar todos tirarem no celular, preenche todos os times automaticamente de uma vez.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busyAction !== null || eligiblePlayers.length === 0}
                      onClick={() =>
                        handleTriggerDrawAction(
                          'run_full_draw',
                          'run-full-draw',
                          'Preencher vagas automaticamente',
                          'Deseja sortear e preencher todos os times automaticamente agora?',
                          'Todas as vagas foram preenchidas automaticamente pelo sorteio!'
                        )
                      }
                      className="tappable hover-surface w-full h-11 px-4 rounded-xl border border-[var(--chalk-line-strong)] bg-[#0D281D] text-[var(--ink-chalk)] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Shuffle className="w-4 h-4 text-[var(--gold-trophy)]" />
                      <span>Preencher Vagas Automaticamente</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Primary Closed Draw Button */}
                  <div className="rounded-xl border border-[var(--gold-trophy)]/40 bg-[var(--gold-trophy)]/10 p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--gold-trophy)] uppercase tracking-wider">
                        Ação Principal (Fechado)
                      </div>
                      <p className="text-xs text-[var(--ink-sage)] mt-1 leading-normal">
                        Embaralha os jogadores e divide os times de forma equilibrada mantendo o segredo para cada um abrir.
                      </p>
                    </div>

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
                      className="tappable hover-gold w-full h-11 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Shuffle className="w-4 h-4 text-[#071A12]" />
                      <span>Embaralhar & Sortear Times em Segredo</span>
                    </button>
                  </div>

                  {/* Secondary Switch to Live Urn Button */}
                  <div className="rounded-xl border border-[var(--chalk-line)] bg-[#071A12] p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--ink-chalk)] uppercase tracking-wider">
                        Mudar Dinâmica
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] mt-1 leading-normal">
                        Prefere que cada um tire sua bolinha ao vivo na quadra? Ative a Urna Ao Vivo.
                      </p>
                    </div>

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
                      className="tappable hover-surface w-full h-11 px-4 rounded-xl border border-[var(--chalk-line-strong)] bg-[#0D281D] text-[var(--ink-chalk)] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className="w-4 h-4 text-[var(--gold-trophy)]" />
                      <span>Mudar para Urna Ao Vivo</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Visibility / Suspense Control Card */}
          <div className="rounded-xl border border-[var(--chalk-line)] bg-[#071A12] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-chalk)]">
                  Visibilidade Pública na Aba &quot;Times&quot;
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    match.revealAllPublic
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {match.revealAllPublic ? 'Tudo Revelado' : 'Sem Spoiler (Segredo Ativo)'}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                {match.revealAllPublic
                  ? 'A escalação completa já está visível para qualquer pessoa que abrir a aba Times.'
                  : 'Os nomes só aparecem para quem já tirou/abriu a bolinha. As vagas não sorteadas ficam como "?" na prancheta.'}
              </p>
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
              className={`tappable h-10 px-4 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shrink-0 ${
                match.revealAllPublic
                  ? 'border-sky-400/50 bg-sky-950/60 text-sky-200 hover:bg-sky-900/60'
                  : 'border-[var(--chalk-line-strong)] bg-[#0D281D] text-[var(--ink-chalk)] hover:bg-[#133628]'
              }`}
            >
              {match.revealAllPublic ? (
                <>
                  <EyeOff className="w-4 h-4 text-sky-300" />
                  <span>Ocultar e Ativar Modo Sem Spoiler</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-[var(--gold-trophy)]" />
                  <span>Revelar Todos os Times no Painel</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. WhatsApp List Importer */}
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
            Importar Lista do WhatsApp
          </h3>
          <p className="text-sm text-[var(--ink-sage)]">
            Cole a mensagem do grupo exatamente como vem no WhatsApp. O sistema entende goleiros, convidados, dúvidas, números repetidos e vagas vazias.
          </p>
        </div>

        <textarea
          id="whatsapp-list-input"
          rows={9}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`Cole aqui a lista do WhatsApp, ex:\nDATA: Quinta-feira\nHORÁRIO: 21:00\nVALOR: R$ 15\n1- Nome\n2- Nome (convidado)\nGoleiros:\n3- Nome`}
          className="w-full rounded-xl bg-[#071A12] border border-[var(--chalk-line)] p-3.5 text-base leading-relaxed text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] outline-none"
        />

        {preview && (
          <div className="border-t border-[var(--chalk-line)] pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular-nums">
              <span className="rounded-md bg-[var(--bg-pitch)] px-2.5 py-1 text-[var(--ink-chalk)]">
                {preview.summary.outfieldCount} linha
              </span>
              <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-amber-200">
                {preview.summary.gkCount} goleiros
              </span>
              <span className="rounded-md bg-amber-950 px-2.5 py-1 text-amber-300">
                {preview.summary.doubtCount} dúvida(s)
              </span>
              <span className="rounded-md bg-[#071A12] px-2.5 py-1 text-[var(--ink-sage)]">
                {preview.summary.openSlotCount} vaga(s) em aberto
              </span>
              {(preview.meta.dateLabel || preview.meta.timeLabel || preview.meta.feeLabel) && (
                <span className="text-[var(--ink-sage)]">
                  {[preview.meta.dateLabel, preview.meta.timeLabel, preview.meta.feeLabel].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>

            {preview.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-200/90">
                {preview.warnings.map((w) => (
                  <li key={w} className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busyAction !== null || !rawText.trim()}
            onClick={() =>
              runAction(
                'import-list',
                () => importMatchList(match.slug, rawText, true, effectiveAuth),
                'Lista importada e times atualizados!'
              )
            }
            className="tappable hover-gold h-11 px-5 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center gap-2 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            Importar Lista e Atualizar Sorteio
          </button>
        </div>
      </div>

      {/* 4. Roster, Swaps, Doubts & R$ 10 Payments */}
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Elenco, Trocas & Caixa
            </h3>
            <p className="text-sm text-[var(--ink-sage)]">
              Confirme dúvidas, troque jogadores de time na hora ou controle quem já pagou a cota.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-200 tabular-nums self-start">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span>
              {paidStats.paidCount}/{paidStats.activeCount} pagos
              {match.meta.feeAmount > 0 ? ` · R$ ${paidStats.paidValue} / R$ ${paidStats.totalValue}` : ''}
            </span>
          </div>
        </div>

        {/* Quick add / fill open slot */}
        <form
          onSubmit={handleAddPlayer}
          className="border-t border-[var(--chalk-line)] pt-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
        >
          <input
            type="text"
            inputMode="numeric"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
            placeholder="Nº"
            aria-label="Número na lista"
            className="sm:col-span-2 h-10 px-3 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-base tabular-nums"
          />
          <input
            id="quick-add-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={
              match.openSlots[0]
                ? `Preencher vaga #${match.openSlots[0].listNumber} ou novo nome...`
                : 'Nome do jogador...'
            }
            className="sm:col-span-5 h-10 px-3 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-base"
          />
          <select
            aria-label="Posição do novo jogador"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value === 'gk' ? 'gk' : 'outfield')}
            className="sm:col-span-2 h-10 px-2.5 rounded-lg bg-[#071A12] border border-[var(--chalk-line)] text-base"
          >
            <option value="outfield">Linha</option>
            <option value="gk">Goleiro</option>
          </select>
          <button
            type="submit"
            disabled={!newName.trim() || busyAction !== null}
            className="sm:col-span-3 tappable hover-gold h-10 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </form>

        {/* Player management table/list */}
        <div className="border-t border-[var(--chalk-line)] divide-y divide-[var(--chalk-line)]">
          {match.players.length === 0 && (
            <div className="py-8 text-center text-sm text-[var(--ink-muted)]">
              Nenhum jogador na lista ainda. Cole a lista do WhatsApp acima ou adicione jogadores um por um.
            </div>
          )}
          {match.players.map((p) => {
            const nextStatus: Record<PlayerStatus, PlayerStatus> = {
              confirmed: 'doubt',
              doubt: 'confirmed',
              waiting: 'confirmed',
              out: 'confirmed'
            };

            return (
              <div
                key={p.id}
                className="py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 text-center text-xs font-bold text-[var(--gold-trophy)] tabular-nums shrink-0">
                    #{p.listNumber ?? '•'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--ink-chalk)]">{p.name}</span>
                      {p.isGuest && (
                        <span className="text-xs rounded px-1.5 py-0.5 bg-sky-500/15 text-sky-200">
                          Convidado
                        </span>
                      )}
                      {p.revealed && (
                        <span className="text-xs rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                          Abriu
                        </span>
                      )}
                    </div>
                    {p.note && <div className="text-xs text-[var(--ink-muted)]">{p.note}</div>}
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-1.5">
                  {/* Paid toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      runAction(`paid-${p.id}`, () =>
                        updatePlayer(match.slug, p.id, { paid: !p.paid }, effectiveAuth)
                      )
                    }
                    className={`tappable h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 tabular-nums ${
                      p.paid
                        ? 'border-emerald-400/40 bg-emerald-950/70 text-emerald-200'
                        : 'border-[var(--chalk-line)] bg-[var(--bg-locker)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {p.paid && <Check className="w-3 h-3" />}
                    {match.meta.feeAmount > 0
                      ? p.paid
                        ? `Pago R$ ${match.meta.feeAmount}`
                        : `Pagar R$ ${match.meta.feeAmount}`
                      : p.paid
                        ? 'Pago'
                        : 'Pendente'}
                  </button>

                  {/* Role toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      runAction(`role-${p.id}`, () =>
                        updatePlayer(
                          match.slug,
                          p.id,
                          { role: p.role === 'gk' ? 'outfield' : 'gk' },
                          effectiveAuth
                        )
                      )
                    }
                    className={`tappable h-8 px-2.5 rounded-lg border text-xs font-semibold ${
                      p.role === 'gk'
                        ? 'border-amber-400/40 bg-amber-500/20 text-amber-200'
                        : 'border-[var(--chalk-line)] bg-[var(--bg-locker)] text-[var(--ink-sage)]'
                    }`}
                  >
                    {p.role === 'gk' ? 'GOL' : 'Linha'}
                  </button>

                  {/* Status toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      runAction(`status-${p.id}`, () =>
                        updatePlayer(
                          match.slug,
                          p.id,
                          { status: nextStatus[p.status] },
                          effectiveAuth
                        )
                      )
                    }
                    className={`tappable h-8 px-2.5 rounded-lg border text-xs font-semibold ${
                      p.status === 'confirmed'
                        ? 'border-emerald-500/30 bg-[#0D281D] text-emerald-200'
                        : p.status === 'doubt'
                          ? 'border-amber-400/45 bg-amber-950/60 text-amber-200'
                          : 'border-red-400/30 bg-red-950/40 text-red-200'
                    }`}
                  >
                    {p.status === 'confirmed'
                      ? 'Confirmado'
                      : p.status === 'doubt'
                        ? 'Dúvida'
                        : p.status === 'waiting'
                          ? 'Espera'
                          : 'Fora'}
                  </button>

                  {/* Team manual assignment / swap OR draw single */}
                  <select
                    aria-label={`Time de ${p.name}`}
                    value={p.teamId || ''}
                    onChange={(e) =>
                      runAction(`swap-${p.id}`, () =>
                        updatePlayer(
                          match.slug,
                          p.id,
                          { teamId: e.target.value || null },
                          effectiveAuth
                        )
                      )
                    }
                    className="h-8 px-2 rounded-lg bg-[var(--bg-locker)] border border-[var(--chalk-line)] text-base sm:text-xs font-semibold text-[var(--ink-chalk)]"
                  >
                    <option value="">Sem time</option>
                    {match.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  {!p.teamId && p.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          `draw-one-${p.id}`,
                          () => updatePlayer(match.slug, p.id, { drawNow: true }, effectiveAuth),
                          `${p.name} sorteado!`
                        )
                      }
                      className="tappable h-8 px-2.5 rounded-lg bg-[var(--gold-trophy)] text-[#071A12] text-xs font-bold"
                    >
                      Sortear
                    </button>
                  )}

                  <button
                    type="button"
                    title="Remover jogador"
                    aria-label={`Remover ${p.name}`}
                    onClick={() =>
                      runAction(
                        `del-${p.id}`,
                        () => updatePlayer(match.slug, p.id, { delete: true }, effectiveAuth),
                        `${p.name} removido da lista.`
                      )
                    }
                    className="tappable w-8 h-8 rounded-lg border border-[var(--chalk-line)] bg-[var(--bg-locker)] text-[var(--ink-muted)] hover:text-red-300 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
