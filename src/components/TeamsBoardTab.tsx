import { Check, Copy, Eye, EyeOff, Lock, RefreshCw, Shield, Users } from 'lucide-react';
import { useState } from 'react';
import { fetchWhatsAppExport } from '../lib/api';
import type { MatchState } from '../types';
import { MiniPitchSvg, VestBadge } from './TiraTimeCrest';

interface TeamsBoardTabProps {
  match: MatchState;
  adminAuth?: { pin?: string; token?: string };
  onToast: (message: string) => void;
}

export function TeamsBoardTab({ match, adminAuth, onToast }: TeamsBoardTabProps) {
  const [copied, setCopied] = useState(false);

  const eligiblePlayers = match.players.filter(
    (p) => p.status === 'confirmed' || (match.includeDoubts && p.status === 'doubt')
  );
  const revealedPlayers = eligiblePlayers.filter((p) => p.revealed);
  const unrevealedTotal = eligiblePlayers.length - revealedPlayers.length;
  const doubts = match.players.filter((p) => p.status === 'doubt' && !p.teamId);
  const unassignedConfirmed = match.players.filter(
    (p) => (p.status === 'confirmed' || p.status === 'waiting') && !p.teamId
  );

  const effectiveAuth = adminAuth || (match.isAdmin ? { token: match.adminToken, pin: match.adminPin } : undefined);

  const handleCopyWhatsApp = async () => {
    try {
      const text = await fetchWhatsAppExport(match.slug, effectiveAuth);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onToast('Escalação copiada! Só colar no grupo do WhatsApp.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Não foi possível copiar automaticamente.');
    }
  };

  const gridClass =
    match.teams.length === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : match.teams.length === 4
        ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
        : 'grid-cols-1 md:grid-cols-3';

  return (
    <section className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      {/* Top summary bar */}
      <div className="rounded-2xl panel-hero border border-[var(--chalk-line)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-[var(--ink-chalk)]">
            Prancheta dos Times
          </h2>
          <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm text-[var(--ink-sage)]">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Users className="w-4 h-4 text-[var(--gold-trophy)]" />
              {match.teams.length} times · {eligiblePlayers.length} atletas no sorteio
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {match.revealAllPublic || match.isAdmin ? (
                <Eye className="w-4 h-4 text-emerald-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-amber-300" />
              )}
              {revealedPlayers.length} de {eligiblePlayers.length} já revelaram
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyWhatsApp}
          className="tappable hover-gold h-10 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copiado!' : 'Copiar times pro WhatsApp'}</span>
        </button>
      </div>

      {!match.revealAllPublic && !match.isAdmin && unrevealedTotal > 0 && (
        <div className="rounded-xl border border-[var(--chalk-line)] bg-[var(--bg-pitch)]/70 px-4 py-3 text-xs sm:text-sm text-[var(--ink-sage)] flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-[var(--gold-trophy)] shrink-0" />
          <span>
            Suspense da Urna ativo: cada jogador vai preenchendo os times aqui ao vivo conforme tira sua bolinha na aba{' '}
            <strong className="text-[var(--ink-chalk)]">Urna do Sorteio</strong>.
          </span>
        </div>
      )}

      {/* Teams Grid */}
      <div className={`grid ${gridClass} gap-4`}>
        {match.teams.map((team) => {
          const visibleRoster = match.players
            .filter(
              (p) =>
                p.teamId === team.id &&
                (match.revealAllPublic || match.isAdmin || p.revealed)
            )
            .sort((a, b) =>
              a.role === b.role ? a.sortOrder - b.sortOrder : a.role === 'gk' ? -1 : 1
            );

          const gkCap = Math.max(1, team.gkCap ?? 1);
          const outfieldCap = Math.max(3, team.outfieldCap ?? 6);
          const targetTotal = gkCap + outfieldCap;

          const visibleGks = match.balanceGk ? visibleRoster.filter((p) => p.role === 'gk') : [];
          const visibleOutfield = match.balanceGk
            ? visibleRoster.filter((p) => p.role !== 'gk')
            : visibleRoster;
          const gkCount = visibleGks.length;
          const totalHiddenSlots = Math.max(0, targetTotal - visibleRoster.length);
          const hiddenGkSlots = match.balanceGk
            ? Math.min(totalHiddenSlots, Math.max(0, gkCap - gkCount))
            : 0;
          const hiddenLineSlots = Math.max(0, totalHiddenSlots - hiddenGkSlots);
          const lineCount = visibleOutfield.length;

          return (
            <article
              key={team.id}
              className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] overflow-hidden flex flex-col"
            >
              {/* Vest Header */}
              <div
                className="px-4 py-3.5 flex items-center justify-between gap-2 border-b"
                style={{
                  backgroundColor: team.color,
                  color: team.textColor,
                  borderColor: team.borderColor
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[#071A12] border border-white/15 flex items-center justify-center shrink-0">
                    <VestBadge team={team} size="md" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl font-extrabold uppercase leading-none truncate">
                      {team.name}
                    </h3>
                    <div className="text-xs font-semibold opacity-90 mt-0.5 tabular-nums">
                      1 no Gol · {outfieldCap} na Linha ({visibleRoster.length}/{targetTotal} revelados)
                    </div>
                  </div>
                </div>
              </div>

              {/* Tactical Pitch Diagram */}
              <div className="p-3 border-b border-[var(--chalk-line)] bg-[#0A2218]">
                <MiniPitchSvg
                  team={team}
                  players={visibleRoster}
                  hiddenCount={hiddenLineSlots}
                  balanceGk={match.balanceGk}
                />
              </div>

              {/* Player Roster: 1 GK + 6 Outfield slots */}
              <div className="divide-y divide-[var(--chalk-line)] flex-1">
                {/* Goalkeeper slot(s) */}
                {visibleGks.map((p) => (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-[var(--gold-trophy)] tabular-nums w-6 shrink-0">
                        #{p.listNumber ?? '•'}
                      </span>
                      <span className="text-sm font-semibold text-[var(--ink-chalk)] truncate">
                        {p.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30 inline-flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" />
                        GOL
                      </span>
                      {!p.revealed && match.isAdmin && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[#071A12] text-[var(--ink-muted)]">
                          Não abriu
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {Array.from({ length: hiddenGkSlots }).map((_, idx) => (
                  <div
                    key={`masked-gk-${team.id}-${idx}`}
                    className="px-4 py-2.5 bg-[#081F15]/45 flex items-center justify-between text-xs text-[var(--ink-muted)]"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-[var(--gold-trophy)]" />
                      Goleiro (1 no gol)
                    </span>
                    <span>Na urna</span>
                  </div>
                ))}

                {/* Outfield 6 slots */}
                {visibleOutfield.map((p, idx) => (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-[var(--ink-muted)] tabular-nums w-6 shrink-0">
                        #{p.listNumber ?? '•'}
                      </span>
                      <span className="text-sm font-semibold text-[var(--ink-chalk)] truncate">
                        {p.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.isGuest && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-sky-500/15 text-sky-200">
                          Conv.
                        </span>
                      )}
                      <span className="text-xs font-medium text-[var(--ink-muted)] tabular-nums">
                        Linha {idx + 1}/{outfieldCap}
                      </span>
                      {!p.revealed && match.isAdmin && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[#071A12] text-[var(--ink-muted)]">
                          Não abriu
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {Array.from({ length: hiddenLineSlots }).map((_, idx) => {
                  const slotNum = lineCount + idx + 1;
                  return (
                    <div
                      key={`masked-line-${team.id}-${idx}`}
                      className="px-4 py-2.5 bg-[#081F15]/45 flex items-center justify-between text-xs text-[var(--ink-muted)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        Linha {slotNum}/{outfieldCap} — Aguardando sortear
                      </span>
                      <span>Na urna</span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {/* Reserves / Waiting list, Doubts and Open Slots footer strip */}
      {(unassignedConfirmed.length > 0 || doubts.length > 0 || match.openSlots.length > 0) && (
        <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {unassignedConfirmed.length > 0 && (
            <div>
              <h4 className="font-display text-lg font-bold uppercase text-[var(--gold-trophy)] flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  Próximos da Fila / Suplentes
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold-trophy)]/20 text-[var(--gold-trophy)] border border-[var(--gold-trophy)]/30">
                  {unassignedConfirmed.length}
                </span>
              </h4>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5 mb-2">
                Atletas confirmados aguardando vaga ({match.teams[0]?.outfieldCap ?? 6} na linha configurado).
              </p>
              <ul className="space-y-1 text-sm text-[var(--ink-sage)]">
                {unassignedConfirmed.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ink-chalk)] truncate">
                      #{p.listNumber ?? '•'} {p.name}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)] shrink-0">
                      {p.role === 'gk' ? 'Goleiro' : 'Linha'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doubts.length > 0 && (
            <div>
              <h4 className="font-display text-lg font-bold uppercase text-amber-200">
                Em dúvida / Aguardando confirmação
              </h4>
              <ul className="mt-1.5 space-y-1 text-sm text-[var(--ink-sage)]">
                {doubts.map((d) => (
                  <li key={d.id}>
                    <span className="font-semibold text-[var(--ink-chalk)]">
                      #{d.listNumber ?? '•'} {d.name}
                    </span>
                    {d.note ? ` — ${d.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {match.openSlots.length > 0 && (
            <div>
              <h4 className="font-display text-lg font-bold uppercase text-[var(--ink-chalk)]">
                Vagas em aberto na lista
              </h4>
              <p className="mt-1 text-sm text-[var(--ink-sage)] tabular-nums">
                {match.openSlots.map((s) => `Vaga #${s.listNumber}`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
