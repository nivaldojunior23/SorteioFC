import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import { verifyAdminAuth } from '../../lib/api';
import type { MatchState } from '../../types';

interface OrganizerAuthGateProps {
  slug: string;
  groupName: string;
  onAuthenticated: (token: string, pin: string, nextMatch: MatchState) => void;
  onGoHome: () => void;
  onToast: (message: string) => void;
}

/** PIN unlock screen shown before organizer controls when the session has no valid admin token. */
export function OrganizerAuthGate({
  slug,
  groupName,
  onAuthenticated,
  onGoHome,
  onToast
}: OrganizerAuthGateProps) {
  const [pinInput, setPinInput] = useState('');
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await verifyAdminAuth(slug, { pin: pinInput.trim() });
      onAuthenticated(res.adminToken, pinInput.trim(), res.match);
      onToast('Painel do organizador desbloqueado.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'PIN incorreto.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <section className="max-w-md mx-auto px-4 py-8">
      <div className="rounded-2xl panel-hero border border-[var(--chalk-line)] p-6 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          <div className="w-12 h-12 rounded-xl bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/40 shadow-[inset_0_1px_0_rgba(255,253,240,0.2)] flex items-center justify-center text-[var(--gold-trophy)]">
            <KeyRound className="w-6 h-6" aria-hidden="true" />
          </div>
          <span className="rounded-lg pitch-inset border border-[var(--chalk-line)] px-2.5 py-1 font-mono text-xs text-[var(--ink-sage)]">
            {slug}
          </span>
        </div>

        <h2 className="mt-4 font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
          Área do Organizador · {groupName}
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
                name="adminPin"
                type={showLoginPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Digite o PIN da sala…"
                className="w-full h-11 pl-3.5 pr-11 rounded-xl pitch-inset border border-[var(--chalk-line)] text-base text-[var(--ink-chalk)] tabular-nums focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/40"
              />
              <button
                type="button"
                onClick={() => setShowLoginPin((v) => !v)}
                aria-label={showLoginPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
              >
                {showLoginPin ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
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
            className="tappable hover-gold btn-gold w-full h-11 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed"
          >
            {authLoading ? 'Verificando…' : 'Entrar como Organizador'}
          </button>
        </form>

        <button
          type="button"
          onClick={onGoHome}
          className="tappable hover-surface mt-3 w-full h-10 rounded-xl border border-[var(--chalk-line)] pitch-inset text-xs font-semibold text-[var(--ink-sage)] inline-flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Voltar para Minhas Peladas
        </button>
      </div>
    </section>
  );
}
