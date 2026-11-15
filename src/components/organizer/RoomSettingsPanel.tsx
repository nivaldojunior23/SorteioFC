import { useEffect, useState } from 'react';
import {
  Calendar,
  Copy,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Link2,
  Pencil,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { deleteMatch, executeDraw, updateMatchSettings, type AdminAuth } from '../../lib/api';
import { forgetMatch } from '../../lib/recent';
import type { MatchState } from '../../types';
import { ConfirmAlertDialog } from './ConfirmAlertDialog';

const MIN_PIN = 4;

interface RoomSettingsPanelProps {
  match: MatchState;
  effectiveAuth: AdminAuth;
  busyAction: string | null;
  setBusyAction: (label: string | null) => void;
  currentAdminPin: string;
  metaSummary: string;
  playerShareUrl: string;
  adminShareUrl: string;
  runAction: (label: string, fn: () => Promise<MatchState>, successMsg?: string) => Promise<void>;
  copyText: (value: string, label: string) => void;
  onAuthenticated: (token: string, pin: string, nextMatch: MatchState) => void;
  onGoHome: () => void;
  onToast: (message: string) => void;
}

/** Organizer Tab 3: room share links, match info editor, PIN management, new-week reset, and delete room. */
export function RoomSettingsPanel({
  match,
  effectiveAuth,
  busyAction,
  setBusyAction,
  currentAdminPin,
  metaSummary,
  playerShareUrl,
  adminShareUrl,
  runAction,
  copyText,
  onAuthenticated,
  onGoHome,
  onToast
}: RoomSettingsPanelProps) {
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);
  const [showCurrentPin, setShowCurrentPin] = useState(false);

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editGroupName, setEditGroupName] = useState(match.groupName);
  const [editDateLabel, setEditDateLabel] = useState(match.meta.dateLabel);
  const [editTimeLabel, setEditTimeLabel] = useState(match.meta.timeLabel);
  const [editFeeAmount, setEditFeeAmount] = useState(
    match.meta.feeAmount > 0 ? String(match.meta.feeAmount) : ''
  );

  const [confirmDanger, setConfirmDanger] = useState<'reset_week' | 'delete_room' | null>(null);

  useEffect(() => {
    setEditGroupName(match.groupName);
    setEditDateLabel(match.meta.dateLabel);
    setEditTimeLabel(match.meta.timeLabel);
    setEditFeeAmount(match.meta.feeAmount > 0 ? String(match.meta.feeAmount) : '');
  }, [match.id, match.groupName, match.meta.dateLabel, match.meta.timeLabel, match.meta.feeAmount]);

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
      const token = updated.adminToken || match.adminToken || effectiveAuth.token || '';
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

  const handleDeleteRoom = async () => {
    setBusyAction('delete-room');
    try {
      await deleteMatch(match.slug, effectiveAuth);
      forgetMatch(match.slug);
      onToast(`Sala "${match.groupName}" excluída.`);
      onGoHome();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Não foi possível excluir a sala.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Links & Code */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-3.5">
        <h3 className="font-display text-xl sm:text-2xl font-bold uppercase text-[var(--ink-chalk)]">
          Links & Acesso da Sala
        </h3>

        <div className="rounded-xl border border-[var(--chalk-line)] pitch-inset px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Hash className="w-4 h-4 text-[var(--gold-trophy)] shrink-0" aria-hidden="true" />
            <span className="text-xs text-[var(--ink-sage)]">Código da sala:</span>
            <code className="font-mono text-sm font-bold text-[var(--gold-trophy)] truncate">{match.slug}</code>
          </div>
          <button
            type="button"
            onClick={() => copyText(match.slug, 'Código da sala')}
            className="tappable hover-surface h-8 px-2.5 rounded-lg border border-[var(--chalk-line)] bg-[#0D281D] text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--gold-trophy)]" aria-hidden="true" />
            <span>Copiar código</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => copyText(playerShareUrl, 'Link dos jogadores')}
            className="tappable hover-surface rounded-xl border border-[var(--chalk-line)] pitch-inset p-3.5 flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--gold-trophy)] flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Link do Grupo (Jogadores)</span>
              </div>
              <div className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
                Para os atletas tirarem a bolinha na urna
              </div>
            </div>
            <Copy className="w-4 h-4 text-[var(--ink-sage)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => copyText(adminShareUrl, 'Link direto do organizador')}
            className="tappable hover-surface rounded-xl border border-[var(--chalk-line)] pitch-inset p-3.5 flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Seu Link Direto Admin</span>
              </div>
              <div className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
                Entra no organizador sem digitar o PIN
              </div>
            </div>
            <Copy className="w-4 h-4 text-[var(--ink-sage)] shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Match Info Editor */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/35 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
              <Calendar className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)] truncate">
                Dados da Pelada
              </h3>
              <p className="text-xs text-[var(--ink-sage)] truncate">
                {match.groupName} · {metaSummary || 'Sem dia, horário ou valor definidos'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingInfo((v) => !v)}
            className="tappable hover-surface self-start sm:self-auto h-9 px-3 rounded-xl border border-[var(--chalk-line)] pitch-inset text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5 shrink-0"
          >
            <Pencil className="w-3.5 h-3.5 text-[var(--gold-trophy)]" aria-hidden="true" />
            <span>{isEditingInfo ? 'Cancelar' : 'Editar Dados'}</span>
          </button>
        </div>

        {isEditingInfo && (
          <form
            onSubmit={handleSaveMatchInfo}
            className="rounded-xl border border-[var(--gold-trophy)]/35 bg-[#092419] p-3.5 sm:p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-2">
                <label htmlFor="edit-group-name" className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">
                  Nome da pelada
                </label>
                <input
                  id="edit-group-name"
                  type="text"
                  maxLength={60}
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base sm:text-sm text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
                />
              </div>
              <div>
                <label htmlFor="edit-date-label" className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">
                  Dia / Data
                </label>
                <input
                  id="edit-date-label"
                  type="text"
                  maxLength={40}
                  value={editDateLabel}
                  onChange={(e) => setEditDateLabel(e.target.value)}
                  placeholder="Ex: Quinta-feira…"
                  className="w-full h-10 px-3 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base sm:text-sm text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="edit-time-label" className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">
                    Horário
                  </label>
                  <input
                    id="edit-time-label"
                    type="text"
                    maxLength={20}
                    value={editTimeLabel}
                    onChange={(e) => setEditTimeLabel(e.target.value)}
                    placeholder="21:00"
                    className="w-full h-10 px-2.5 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base sm:text-sm text-[var(--ink-chalk)] tabular-nums focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
                  />
                </div>
                <div>
                  <label htmlFor="edit-fee-amount" className="block text-[11px] font-semibold text-[var(--ink-sage)] mb-1">
                    Valor (R$)
                  </label>
                  <input
                    id="edit-fee-amount"
                    type="text"
                    inputMode="decimal"
                    value={editFeeAmount}
                    onChange={(e) => setEditFeeAmount(e.target.value)}
                    placeholder="10"
                    className="w-full h-10 px-2.5 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base sm:text-sm text-[var(--ink-chalk)] tabular-nums focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busyAction !== null || editGroupName.trim().length < 2}
                className="tappable hover-gold btn-gold h-9 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#06160F] font-bold text-xs disabled:opacity-50"
              >
                {busyAction === 'save-info' ? 'Salvando…' : 'Salvar Dados'}
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

      {/* Organizer PIN Management */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/35 flex items-center justify-center text-[var(--gold-trophy)] shrink-0">
              <KeyRound className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--ink-chalk)] flex items-center gap-1.5 flex-wrap">
                <span>PIN do Organizador:</span>
                <span className="font-mono text-sm text-[var(--gold-trophy)] font-bold tracking-wider px-2 py-0.5 rounded pitch-inset border border-[var(--chalk-line)]">
                  {showCurrentPin ? currentAdminPin : '••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCurrentPin((v) => !v)}
                  className="text-[var(--ink-muted)] hover:text-[var(--ink-chalk)] transition-colors p-1 rounded-md"
                  title={showCurrentPin ? 'Ocultar PIN' : 'Visualizar PIN'}
                  aria-label={showCurrentPin ? 'Ocultar PIN' : 'Visualizar PIN'}
                >
                  {showCurrentPin ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
              </div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">
                Use este PIN para entrar como organizador em outro dispositivo.
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
            className="tappable hover-surface self-start sm:self-auto h-9 px-3 rounded-xl border border-[var(--chalk-line)] pitch-inset text-xs font-semibold text-[var(--gold-trophy)] inline-flex items-center gap-1.5 shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isChangingPin ? 'Cancelar' : 'Alterar PIN'}</span>
          </button>
        </div>

        {isChangingPin && (
          <form
            onSubmit={handleSaveNewPin}
            className="rounded-xl border border-[var(--gold-trophy)]/35 bg-[#092419] p-3.5 sm:p-4 space-y-3"
          >
            <div>
              <label htmlFor="new-pin-input" className="block text-xs font-bold uppercase tracking-wider text-[var(--gold-trophy)]">
                Novo PIN do Organizador
              </label>
              <p className="text-xs text-[var(--ink-sage)] mt-0.5">
                Mínimo de {MIN_PIN} caracteres.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                id="new-pin-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={newPinValue}
                onChange={(e) => setNewPinValue(e.target.value)}
                placeholder="Novo PIN (ex: 2026)…"
                className="h-10 px-3 rounded-lg pitch-inset border border-[var(--chalk-line)] text-base sm:text-sm font-mono text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35 w-52"
              />

              <button
                type="submit"
                disabled={busyAction !== null || newPinValue.trim().length < MIN_PIN}
                className="tappable hover-gold btn-gold h-10 px-4 rounded-lg bg-[var(--gold-trophy)] text-[#06160F] font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyAction === 'save-pin' ? 'Salvando…' : 'Salvar Novo PIN'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setNewPinValue('');
                  setPinFeedback(null);
                }}
                className="tappable hover-surface h-10 px-3 rounded-lg border border-[var(--chalk-line)] bg-transparent text-xs text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
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

      {/* Fechar Semana / Nova Rodada & Excluir Sala */}
      <div className="rounded-2xl panel-locker border border-[var(--chalk-line)] p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)]">
            Fechar Semana & Manutenção da Sala
          </h3>
          <p className="text-xs sm:text-sm text-[var(--ink-sage)] mt-0.5">
            Reaproveite o mesmo link toda semana apagando a lista anterior, ou exclua esta sala de vez.
          </p>
        </div>

        {confirmDanger === 'reset_week' && (
          <ConfirmAlertDialog
            title="Zerar semana (apagar jogadores e escalação)"
            description="Todos os jogadores, pagamentos e escalação serão apagados da sala. O link de acesso, PIN e configurações continuam salvos prontos para você importar a nova lista da semana."
            confirmLabel="Sim, zerar semana"
            busy={busyAction !== null}
            onCancel={() => setConfirmDanger(null)}
            onConfirm={() => {
              setConfirmDanger(null);
              runAction(
                'reset-week',
                () => executeDraw(match.slug, 'reset_week', effectiveAuth),
                'Semana zerada! Jogadores apagados e sala pronta para a nova lista.'
              );
            }}
          />
        )}

        {confirmDanger === 'delete_room' && (
          <ConfirmAlertDialog
            title={`Excluir sala “${match.groupName}” permanentemente?`}
            description="Essa ação não pode ser desfeita. O link da pelada, os jogadores e o histórico do sorteio serão removidos do servidor."
            confirmLabel={busyAction === 'delete-room' ? 'Excluindo…' : 'Sim, excluir sala'}
            tone="red"
            busy={busyAction !== null}
            onCancel={() => setConfirmDanger(null)}
            onConfirm={handleDeleteRoom}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => setConfirmDanger('reset_week')}
            className="tappable hover-surface min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-400/35 bg-amber-950/40 text-left flex items-center gap-3 disabled:opacity-45"
          >
            <RotateCcw className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-amber-200">
                Zerar semana (Nova Rodada)
              </div>
              <div className="text-[11px] text-amber-200/75">
                Apaga jogadores e escalação para a nova lista
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => setConfirmDanger('delete_room')}
            className="tappable hover-surface min-h-[44px] px-4 py-2.5 rounded-xl border border-red-400/35 bg-red-950/35 text-left flex items-center gap-3 disabled:opacity-45"
          >
            <Trash2 className="w-4 h-4 text-red-300 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-red-200">
                Excluir esta sala
              </div>
              <div className="text-[11px] text-red-200/75">
                Remove a pelada e desativa o link compartilhado
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
