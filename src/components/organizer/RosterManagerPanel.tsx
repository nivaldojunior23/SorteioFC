import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Trash2,
  Upload
} from 'lucide-react';
import {
  addPlayer,
  executeDraw,
  importMatchList,
  previewWhatsAppParse,
  updatePlayer,
  type AdminAuth
} from '../../lib/api';
import type { MatchState, ParsePreviewResult, PlayerStatus } from '../../types';
import { ConfirmAlertDialog } from './ConfirmAlertDialog';

/** Builds a ready-to-paste WhatsApp group list matching the room's current formation and metadata. */
function buildGroupListTemplate(match: MatchState, outfieldCap: number): string {
  const cleanTitle =
    match.groupName && match.groupName.trim().toLowerCase() !== 'tiratime'
      ? match.groupName.trim().toUpperCase()
      : 'DA PELADA';
  const dateLabel = match.meta.dateLabel?.trim() || 'Quinta-feira';
  const timeLabel = match.meta.timeLabel?.trim() || '21:00';
  const feeLabel =
    match.meta.feeLabel?.trim() ||
    (match.meta.feeAmount > 0 ? `R$ ${match.meta.feeAmount}` : 'R$ 15');

  const teamCount = Math.max(2, match.teams.length || 2);
  const lines = [
    `LISTA ${cleanTitle} ⚽`,
    `📅 DATA: ${dateLabel}`,
    `🕘 HORÁRIO: ${timeLabel} (cheguem 10 min antes)`,
    `💸 VALOR: ${feeLabel}`,
    ''
  ];

  if (match.balanceGk) {
    const outfieldTotal = teamCount * outfieldCap;
    for (let i = 1; i <= outfieldTotal; i += 1) {
      lines.push(`${i}- `);
    }
    lines.push('', '🧤 Goleiros:');
    for (let i = 1; i <= teamCount; i += 1) {
      lines.push(`${outfieldTotal + i}- `);
    }
  } else {
    const totalSlots = teamCount * (outfieldCap + 1);
    for (let i = 1; i <= totalSlots; i += 1) {
      lines.push(`${i}- `);
    }
  }

  return lines.join('\n');
}

interface RosterManagerPanelProps {
  match: MatchState;
  effectiveAuth: AdminAuth;
  busyAction: string | null;
  currentOutfieldCap: number;
  runAction: (label: string, fn: () => Promise<MatchState>, successMsg?: string) => Promise<void>;
  copyText: (value: string, label: string) => void;
  onToast: (message: string) => void;
}

/** Organizer Tab 2: WhatsApp list import, ready-to-copy group template, quick add, payments & swaps. */
export function RosterManagerPanel({
  match,
  effectiveAuth,
  busyAction,
  currentOutfieldCap,
  runAction,
  copyText,
  onToast
}: RosterManagerPanelProps) {
  const [rawText, setRawText] = useState(match.rawList);
  const [preview, setPreview] = useState<ParsePreviewResult | null>(null);
  const [showListTemplate, setShowListTemplate] = useState(false);
  const [confirmResetWeek, setConfirmResetWeek] = useState(false);

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

  const whatsappGroupTemplate = useMemo(
    () => buildGroupListTemplate(match, currentOutfieldCap),
    [
      match.groupName,
      match.meta.dateLabel,
      match.meta.timeLabel,
      match.meta.feeLabel,
      match.meta.feeAmount,
      match.teams.length,
      match.balanceGk,
      currentOutfieldCap
    ]
  );

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
            revealNow: match.revealAllPublic
          },
          effectiveAuth
        ),
      `${newName.trim()} adicionado à lista.`
    );
    setNewName('');
    setNewGuest(false);
  };

  return (
    <div className="space-y-5">
      {/* WhatsApp List Importer */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Importar Lista do WhatsApp
            </h3>
            <p className="text-xs sm:text-sm text-[var(--ink-sage)] mt-0.5">
              Cole a mensagem do grupo como vem no WhatsApp. O sistema reconhece goleiros, convidados, dúvidas e vagas abertas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText(whatsappGroupTemplate, 'Modelo da lista para o grupo')}
              className="tappable hover-surface h-9 px-3 rounded-xl border border-[var(--gold-trophy)]/40 bg-[var(--gold-trophy)]/12 text-xs font-bold text-[var(--gold-trophy)] inline-flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copiar modelo p/ grupo</span>
            </button>
            <button
              type="button"
              onClick={() => setShowListTemplate((v) => !v)}
              className="tappable hover-surface h-9 px-3 rounded-xl border border-[var(--chalk-line)] pitch-inset text-xs font-semibold text-[var(--ink-sage)] hover:text-[var(--ink-chalk)] inline-flex items-center gap-1.5"
            >
              {showListTemplate ? (
                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{showListTemplate ? 'Ocultar modelo' : 'Ver modelo'}</span>
            </button>
          </div>
        </div>

        {showListTemplate && (
          <div className="rounded-xl pitch-inset border border-[var(--chalk-line)] p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-[var(--ink-chalk)] tabular-nums">
                Modelo pronto ({match.teams.length * (currentOutfieldCap + 1)} vagas conforme sua formação)
              </span>
              <span className="text-[11px] text-[var(--ink-muted)]">
                Aceita <code className="text-[var(--ink-sage)]">(convidado)</code>,{' '}
                <code className="text-[var(--ink-sage)]">(dúvida)</code>,{' '}
                <code className="text-[var(--ink-sage)]">(gol)</code> e <code className="text-[var(--ink-sage)]">Lista de espera:</code>
              </span>
            </div>

            <pre className="max-h-56 overflow-y-auto rounded-lg bg-[#081F15] border border-[var(--chalk-line)] p-3 font-sans text-xs sm:text-sm leading-relaxed text-[var(--ink-chalk)] whitespace-pre-wrap select-all">
              {whatsappGroupTemplate}
            </pre>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyText(whatsappGroupTemplate, 'Modelo da lista para o grupo')}
                className="tappable hover-gold btn-gold h-9 px-3.5 rounded-lg bg-[var(--gold-trophy)] text-[#06160F] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copiar para mandar no WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawText(whatsappGroupTemplate);
                  setShowListTemplate(false);
                  onToast('Modelo inserido no campo de importação.');
                }}
                className="tappable hover-surface h-9 px-3 rounded-lg border border-[var(--chalk-line)] bg-[#0D281D] text-xs font-semibold text-[var(--ink-chalk)]"
              >
                Colar no editor abaixo
              </button>
            </div>
          </div>
        )}

        <textarea
          id="whatsapp-list-input"
          aria-label="Lista do WhatsApp"
          rows={7}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`Cole aqui a lista do WhatsApp, ex:\nDATA: Quinta-feira\nHORÁRIO: 21:00\nVALOR: R$ 15\n1- Nome\n2- Nome (convidado)\nGoleiros:\n3- Nome…`}
          className="w-full rounded-xl pitch-inset border border-[var(--chalk-line)] p-3.5 text-base leading-relaxed text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
        />

        {preview && (
          <div className="space-y-2">
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
              <span className="rounded-md pitch-inset px-2.5 py-1 text-[var(--ink-sage)]">
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
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
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
            className="tappable hover-gold btn-gold h-11 px-5 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center gap-2 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>{busyAction === 'import-list' ? 'Importando…' : 'Importar Lista e Atualizar Sorteio'}</span>
          </button>
        </div>
      </div>

      {/* Roster, Swaps, Doubts & Payments */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
              Elenco, Trocas & Caixa
            </h3>
            <p className="text-xs sm:text-sm text-[var(--ink-sage)]">
              Adicione atletas, mude posição/status, troque times ou dê baixa no pagamento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <div className="inline-flex items-center gap-2 rounded-xl pitch-inset border border-emerald-400/25 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-200 tabular-nums">
              <Banknote className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>
                {paidStats.paidCount}/{paidStats.activeCount} pagos
                {match.meta.feeAmount > 0 ? ` · R$ ${paidStats.paidValue} / R$ ${paidStats.totalValue}` : ''}
              </span>
            </div>

            {match.players.length > 0 && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => setConfirmResetWeek(true)}
                className="tappable hover-surface h-9 px-3 rounded-xl border border-amber-400/35 bg-amber-950/40 text-xs font-semibold text-amber-200 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                <span>Zerar semana</span>
              </button>
            )}
          </div>
        </div>

        {confirmResetWeek && (
          <ConfirmAlertDialog
            title="Zerar semana (apagar jogadores e escalação)"
            description="Todos os jogadores serão removidos da sala. As configurações, PIN e link continuam salvos prontos para você importar a nova lista da próxima rodada."
            confirmLabel="Sim, zerar semana"
            busy={busyAction !== null}
            onCancel={() => setConfirmResetWeek(false)}
            onConfirm={() => {
              setConfirmResetWeek(false);
              runAction(
                'reset-week',
                () => executeDraw(match.slug, 'reset_week', effectiveAuth),
                'Semana zerada! Jogadores apagados e sala pronta para a nova lista.'
              );
            }}
          />
        )}

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
            className="sm:col-span-2 h-10 px-3 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base tabular-nums focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
          />
          <input
            id="quick-add-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={
              match.openSlots[0]
                ? `Preencher vaga #${match.openSlots[0].listNumber} ou novo nome…`
                : 'Nome do jogador…'
            }
            aria-label="Nome do jogador"
            className="sm:col-span-5 h-10 px-3 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
          />
          <select
            aria-label="Posição do novo jogador"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value === 'gk' ? 'gk' : 'outfield')}
            className="sm:col-span-2 h-10 px-2.5 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
          >
            <option value="outfield">Linha</option>
            <option value="gk">Goleiro</option>
          </select>
          <button
            type="submit"
            disabled={!newName.trim() || busyAction !== null}
            className="sm:col-span-3 tappable hover-gold btn-gold h-10 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Adicionar</span>
          </button>
        </form>

        {/* Clean Player Management Rows */}
        <div className="space-y-2 pt-1">
          {match.players.length === 0 && (
            <div className="py-8 text-center text-sm text-[var(--ink-muted)] rounded-xl pitch-inset border border-[var(--chalk-line)]">
              Nenhum jogador na lista ainda. Cole a lista do WhatsApp acima ou adicione um por um.
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
                className="rounded-xl border border-[var(--chalk-line)] pitch-inset px-3 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 text-center text-xs font-bold text-[var(--gold-trophy)] tabular-nums shrink-0">
                    #{p.listNumber ?? '•'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--ink-chalk)] truncate">
                        {p.name}
                      </span>
                      {p.isGuest && (
                        <span className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-sky-500/15 text-sky-200">
                          Convidado
                        </span>
                      )}
                      {p.revealed && (
                        <span className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                          Abriu
                        </span>
                      )}
                    </div>
                    {p.note && <div className="text-xs text-[var(--ink-muted)] truncate">{p.note}</div>}
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-1.5 shrink-0">
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
                    {p.paid && <Check className="w-3 h-3" aria-hidden="true" />}
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

                  {/* Team manual assignment */}
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
                    className="h-8 px-2 rounded-lg bg-[var(--bg-locker)] border border-[var(--chalk-line)] text-base sm:text-xs font-semibold text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
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
                      className="tappable h-8 px-2.5 rounded-lg bg-[var(--gold-trophy)] text-[#06160F] text-xs font-bold"
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
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
