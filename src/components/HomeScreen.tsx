import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  LogIn,
  Plus,
  Share2,
  Trash2,
  Users
} from 'lucide-react';
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
  'w-full h-11 px-3.5 rounded-xl pitch-inset border border-[var(--chalk-line)] text-base text-[var(--ink-chalk)] transition-[border-color,box-shadow,background-color] duration-150 focus:border-[var(--gold-trophy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-trophy)]/35';
const primaryBtn =
  'tappable hover-gold btn-gold w-full h-11 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:bg-[#103022] disabled:text-[var(--ink-sage)] disabled:border disabled:border-[var(--chalk-line)] disabled:cursor-not-allowed';

export function HomeScreen({ onCreated, onOpen, initialError }: HomeScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>(() => (initialError ? 'join' : 'create'));
  const [recent, setRecent] = useState<RecentMatch[]>(() => getRecentMatches());
  const [summaries, setSummaries] = useState<Record<string, MatchSummary>>({});
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const handleCopyLink = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/?pelada=${encodeURIComponent(slug)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      // ignore clipboard failure
    }
  };

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
    <main className="min-h-[100dvh] px-4 py-8 sm:py-11 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg mx-auto">
        <div className="relative flex flex-col items-center text-center">
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-4 rounded-full bg-[var(--gold-trophy)]/14 blur-xl"
              aria-hidden="true"
            />
            <TiraTimeCrest className="relative w-16 h-16 drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]" />
          </div>
          <h1
            translate="no"
            className="mt-3.5 font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-[var(--ink-chalk)]"
          >
            TiraTime
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-sage)]">
            Crie a sala da sua pelada, monte a lista e mande o link pra galera tirar o time na urna.
            Sem cadastro, só um nome e um PIN.
          </p>
        </div>

        {/* If user already has saved rooms, display them in the prominent top spot */}
        {recent.length > 0 && (
          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-[var(--ink-chalk)]">
                  Minhas Peladas
                </h2>
                <span className="rounded-full bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/30 px-2 py-0.5 text-xs font-bold text-[var(--gold-trophy)] tabular-nums">
                  {recent.length}
                </span>
              </div>
              <span className="text-xs text-[var(--ink-muted)]">Salvas neste aparelho</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {recent.map((m) => {
                const info = summaries[m.slug];
                const isCopied = copiedSlug === m.slug;

                return (
                  <div
                    key={m.slug}
                    className="rounded-2xl border border-[var(--chalk-line)] bg-gradient-to-b from-[#0C251A] to-[#071911] p-4 shadow-lg hover:border-[var(--gold-trophy)]/40 transition-all duration-150 space-y-3"
                  >
                    {/* Top row: Name + Role Badge + Trash */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-tight text-[var(--ink-chalk)] truncate">
                            {m.groupName}
                          </h3>
                          {m.isOrganizer ? (
                            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/30 text-[var(--gold-trophy)]">
                              <Crown className="w-3 h-3" />
                              Organizador
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-[#071A12] border border-[var(--chalk-line)] text-[var(--ink-sage)]">
                              Jogador
                            </span>
                          )}
                        </div>

                        {/* Metadata badges: code, date, time, fee, player count */}
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-[var(--ink-sage)]">
                          <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-[var(--gold-trophy)]">
                            <Hash className="w-3 h-3" />
                            {m.slug}
                          </span>
                          {info?.dateLabel && (
                            <>
                              <span className="text-[var(--chalk-line)] font-bold">·</span>
                              <span className="inline-flex items-center gap-1 text-[var(--ink-chalk)] font-medium">
                                <Calendar className="w-3 h-3 text-[var(--gold-trophy)]" />
                                {info.dateLabel}
                              </span>
                            </>
                          )}
                          {info?.timeLabel && (
                            <>
                              <span className="text-[var(--chalk-line)] font-bold">·</span>
                              <span className="inline-flex items-center gap-1 text-[var(--ink-chalk)] font-medium tabular-nums">
                                <Clock className="w-3 h-3 text-[var(--gold-trophy)]" />
                                {info.timeLabel}
                              </span>
                            </>
                          )}
                          {info?.feeLabel && (
                            <>
                              <span className="text-[var(--chalk-line)] font-bold">·</span>
                              <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold tabular-nums">
                                <Banknote className="w-3 h-3 text-emerald-400" />
                                {info.feeLabel}
                              </span>
                            </>
                          )}
                          {typeof info?.playerCount === 'number' && (
                            <>
                              <span className="text-[var(--chalk-line)] font-bold">·</span>
                              <span className="inline-flex items-center gap-1 font-medium">
                                <Users className="w-3 h-3 text-[var(--gold-trophy)]" />
                                {info.playerCount} atletas
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        title="Remover da lista deste aparelho"
                        aria-label={`Remover ${m.groupName} da lista`}
                        onClick={() => {
                          forgetMatch(m.slug);
                          setRecent(getRecentMatches());
                        }}
                        className="tappable hover-surface w-8 h-8 rounded-lg border border-[var(--chalk-line)] text-[var(--ink-muted)] hover:text-red-400 flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bottom action row: Enter room & Copy Link */}
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(m.slug, m.groupName)}
                        className="tappable hover-gold btn-gold flex-1 h-10 rounded-xl bg-[var(--gold-trophy)] text-[#06160F] font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        <span>Entrar no Vestiário</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleCopyLink(m.slug, e)}
                        className="tappable hover-surface h-10 px-3.5 rounded-xl border border-[var(--chalk-line)] bg-[#071A12]/80 text-xs font-semibold text-[var(--ink-chalk)] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                        title="Copiar link para enviar no WhatsApp"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300 font-bold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5 text-[var(--gold-trophy)]" />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual separator */}
            <div className="pt-3 pb-1 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--chalk-line)]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Nova sala ou código
              </span>
              <span className="h-px flex-1 bg-[var(--chalk-line)]" />
            </div>
          </section>
        )}

        <section className={`${recent.length > 0 ? 'mt-2' : 'mt-7'} rounded-2xl panel-hero border border-[var(--gold-trophy)]/35 p-5 sm:p-6`}>
          <div
            role="tablist"
            aria-label="Ação na tela inicial"
            className="grid grid-cols-2 gap-1.5 rounded-xl pitch-inset border border-[var(--chalk-line)] p-1"
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
      </div>
    </main>
  );
}
