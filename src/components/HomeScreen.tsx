import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Crown, Eye, EyeOff, KeyRound, LogIn, Plus, Trash2, Users } from 'lucide-react';
import { createMatch, fetchMatch, fetchMatches, verifyAdminAuth } from '../lib/api';
import { extractRoomCode, forgetMatch, getRecentMatches, rememberMatch, type RecentMatch } from '../lib/recent';
import type { MatchState, MatchSummary } from '../types';
import { TiraTimeCrest } from './TiraTimeCrest';

const MIN_PIN = 4;

interface HomeScreenProps {
  /** Room just created by this user (already authenticated as organizer). */
  onCreated: (match: MatchState) => void;
  /** Open an existing room; adminToken present when the PIN was validated. */
  onOpen: (slug: string, groupName: string, adminToken?: string) => void;
  initialError?: string | null;
}

const inputClass =
  'w-full h-11 px-3.5 rounded-xl bg-[#071A12] border border-[var(--chalk-line)] text-base text-[var(--ink-chalk)] focus:border-[var(--gold-trophy)] outline-none';
const primaryBtn =
  'tappable hover-gold w-full h-11 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed';

export function HomeScreen({ onCreated, onOpen, initialError }: HomeScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>(() => (initialError ? 'join' : 'create'));
  const [recent, setRecent] = useState<RecentMatch[]>(() => getRecentMatches());
  const [summaries, setSummaries] = useState<Record<string, MatchSummary>>({});

  // Create room
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [dateLabel, setDateLabel] = useState('');
  const [timeLabel, setTimeLabel] = useState('');
  const [fee, setFee] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join room
  const [code, setCode] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [showJoinPin, setShowJoinPin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(initialError ?? null);

  useEffect(() => {
    if (initialError) {
      setMode('join');
      setJoinError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    const saved = getRecentMatches();
    if (saved.length === 0) return;
    let cancelled = false;
    fetchMatches(saved.map((m) => m.slug))
      .then((list) => {
        if (cancelled) return;
        const bySlug = new Map(list.map((m) => [m.slug, m]));
        for (const item of saved) {
          const live = bySlug.get(item.slug);
          if (!live) {
            forgetMatch(item.slug);
          } else if (live.groupName !== item.groupName) {
            rememberMatch({ slug: live.slug, groupName: live.groupName, isOrganizer: item.isOrganizer });
          }
        }
        const map: Record<string, MatchSummary> = {};
        list.forEach((m) => {
          map[m.slug] = m;
        });
        setSummaries(map);
        setRecent(getRecentMatches());
      })
      .catch(() => {
        // Keep local list offline / on transient error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setCreateError('Dê um nome para a sua pelada.');
      return;
    }
    if (pin.trim().length < MIN_PIN) {
      setCreateError(`O PIN precisa ter pelo menos ${MIN_PIN} dígitos.`);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createMatch({
        groupName: name.trim(),
        adminPin: pin.trim(),
        dateLabel: dateLabel.trim(),
        timeLabel: timeLabel.trim(),
        feeAmount: fee.trim()
      });
      onCreated(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Não foi possível criar a pelada.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = extractRoomCode(code);
    if (!slug) {
      setJoinError('Digite o código da pelada ou cole o link.');
      return;
    }
    setJoinError(null);
    setJoining(true);
    try {
      if (joinPin.trim()) {
        const res = await verifyAdminAuth(slug, { pin: joinPin.trim() });
        onOpen(res.match.slug, res.match.groupName, res.adminToken);
      } else {
        const m = await fetchMatch(slug);
        onOpen(m.slug, m.groupName);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setJoinError(/não encontrad/i.test(msg) ? 'Não achamos nenhuma pelada com esse código.' : msg || 'Erro ao entrar.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="min-h-[100dvh] px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg mx-auto">
        <div className="flex flex-col items-center text-center">
          <TiraTimeCrest className="w-16 h-16" />
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-[var(--ink-chalk)]">
            TiraTime
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-[var(--ink-sage)]">
            Crie a sala da sua pelada, monte a lista e mande o link pra galera tirar o time na urna.
            Sem cadastro, só um nome e um PIN.
          </p>
        </div>

        <section className="mt-7 rounded-2xl border border-[var(--gold-trophy)]/35 bg-[var(--bg-locker)] p-5">
          <div
            role="tablist"
            aria-label="Ação na tela inicial"
            className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#071A12] border border-[var(--chalk-line)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              onClick={() => setMode('create')}
              className={`tappable h-10 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'create'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover:text-[var(--ink-chalk)]'
              }`}
            >
              <Plus className="w-4 h-4" />
              Criar pelada
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'join'}
              onClick={() => setMode('join')}
              className={`tappable h-10 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'join'
                  ? 'bg-[var(--gold-trophy)] text-[#071A12]'
                  : 'text-[var(--ink-sage)] hover:text-[var(--ink-chalk)]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Entrar em sala
            </button>
          </div>

          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="mt-5 space-y-3.5">
              <div>
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">Criar minha pelada</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  A sala começa zerada pra você colar sua lista ou adicionar os jogadores.
                </p>
              </div>

              <div>
                <label htmlFor="new-name" className="block text-xs font-semibold text-[var(--ink-sage)] mb-1.5">
                  Nome da pelada
                </label>
                <input
                  id="new-name"
                  type="text"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Racha de Quinta"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="new-pin" className="block text-xs font-semibold text-[var(--ink-sage)] mb-1.5">
                  PIN do organizador (só você sabe)
                </label>
                <div className="relative">
                  <input
                    id="new-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={20}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder={`Mínimo ${MIN_PIN} dígitos`}
                    className={`${inputClass} pr-11 tabular-nums`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                  Com o PIN você abre as configurações da pelada em qualquer celular.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs font-semibold text-[var(--gold-trophy)] inline-flex items-center gap-1"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                Dia, horário e valor (opcional)
              </button>

              {showDetails && (
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={dateLabel}
                    onChange={(e) => setDateLabel(e.target.value)}
                    placeholder="Dia (Quinta)"
                    aria-label="Dia da pelada"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={timeLabel}
                    onChange={(e) => setTimeLabel(e.target.value)}
                    placeholder="20:00"
                    aria-label="Horário"
                    className={`${inputClass} tabular-nums`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    placeholder="R$ 10"
                    aria-label="Valor por jogador"
                    className={`${inputClass} tabular-nums`}
                  />
                </div>
              )}

              {createError && (
                <p role="alert" className="text-xs font-medium text-red-300">
                  {createError}
                </p>
              )}

              <button type="submit" disabled={creating} className={primaryBtn}>
                {creating ? 'Criando...' : 'Criar sala da pelada'}
                {!creating && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="mt-5 space-y-3.5">
              <div>
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">Entrar numa pelada</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Cole o código ou o link que enviaram no grupo.
                </p>
              </div>

              <div>
                <label htmlFor="join-code" className="block text-xs font-semibold text-[var(--ink-sage)] mb-1.5">
                  Código da sala ou link
                </label>
                <input
                  id="join-code"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: racha-de-quinta-k7m2"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="join-pin" className="block text-xs font-semibold text-[var(--ink-sage)] mb-1.5">
                  PIN (só se você for o organizador)
                </label>
                <div className="relative">
                  <input
                    id="join-pin"
                    type={showJoinPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={joinPin}
                    onChange={(e) => setJoinPin(e.target.value)}
                    placeholder="Deixe vazio para entrar como jogador"
                    className={`${inputClass} pr-11 tabular-nums`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowJoinPin((v) => !v)}
                    aria-label={showJoinPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-chalk)]"
                  >
                    {showJoinPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {joinError && (
                <p role="alert" className="text-xs font-medium text-red-300">
                  {joinError}
                </p>
              )}

              <button
                type="submit"
                disabled={joining || !code.trim()}
                className={primaryBtn}
              >
                {joinPin.trim() ? <KeyRound className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                {joining ? 'Entrando...' : joinPin.trim() ? 'Entrar como organizador' : 'Entrar como jogador'}
              </button>
            </form>
          )}
        </section>

        {recent.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-5">
            <h2 className="font-display text-xl font-bold uppercase text-[var(--ink-chalk)]">Minhas peladas</h2>
            <p className="text-xs text-[var(--ink-muted)]">Salvas neste aparelho.</p>
            <ul className="mt-3 divide-y divide-[var(--chalk-line)]">
              {recent.map((m) => {
                const info = summaries[m.slug];
                const metaLine = [info?.dateLabel, info?.timeLabel].filter(Boolean).join(' · ');
                return (
                  <li key={m.slug} className="py-2.5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpen(m.slug, m.groupName)}
                      className="tappable min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--ink-chalk)] truncate">{m.groupName}</span>
                        {m.isOrganizer && (
                          <span className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-[var(--gold-trophy)]/15 text-[var(--gold-trophy)]">
                            <Crown className="w-3 h-3" />
                            Organizador
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
                        <span className="font-mono">{m.slug}</span>
                        {metaLine ? ` · ${metaLine}` : ''}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Remover da lista"
                      aria-label={`Remover ${m.groupName} da lista`}
                      onClick={() => {
                        forgetMatch(m.slug);
                        setRecent(getRecentMatches());
                      }}
                      className="tappable w-8 h-8 rounded-lg border border-[var(--chalk-line)] text-[var(--ink-muted)] hover:text-red-300 flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
