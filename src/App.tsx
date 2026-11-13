import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Hourglass } from 'lucide-react';
import { MatchHeader, type ActiveTab } from './components/MatchHeader';
import { PlayerDrawTab } from './components/PlayerDrawTab';
import { TeamsBoardTab } from './components/TeamsBoardTab';
import { OrganizerTab } from './components/OrganizerTab';
import { HomeScreen } from './components/HomeScreen';
import { fetchMatch, type AdminAuth } from './lib/api';
import { rememberMatch } from './lib/recent';
import type { MatchState } from './types';

function readUrlContext() {
  if (typeof window === 'undefined') return { slug: null as string | null, adminToken: '' };
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('pelada') || '').trim().toLowerCase();
  return {
    slug: slug || null,
    adminToken: params.get('admin') || ''
  };
}

function readSavedAuth(slug: string | null): AdminAuth | undefined {
  if (!slug || typeof window === 'undefined') return undefined;
  const saved = window.localStorage.getItem(`tiratime:admin:${slug}`);
  if (!saved) return undefined;
  try {
    const parsed = JSON.parse(saved) as AdminAuth;
    return parsed?.token ? { token: parsed.token } : undefined;
  } catch {
    return undefined;
  }
}

function saveAuth(slug: string, token: string) {
  window.localStorage.setItem(`tiratime:admin:${slug}`, JSON.stringify({ token }));
}

export function App() {
  const initialCtx = readUrlContext();
  const [slug, setSlug] = useState<string | null>(initialCtx.slug);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(initialCtx.slug));
  const [homeError, setHomeError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialCtx.adminToken ? 'admin' : 'draw');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(() =>
    initialCtx.slug ? window.localStorage.getItem(`tiratime:player:${initialCtx.slug}`) : null
  );
  const [adminAuth, setAdminAuth] = useState<AdminAuth | undefined>(() =>
    initialCtx.adminToken ? { token: initialCtx.adminToken } : readSavedAuth(initialCtx.slug)
  );

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // ---- Navigation helpers -------------------------------------------------
  const goHome = useCallback((error?: string) => {
    setSlug(null);
    setMatch(null);
    setAdminAuth(undefined);
    setSelectedPlayerId(null);
    setLoading(false);
    setHomeError(error ?? null);
    window.history.pushState({}, '', window.location.pathname);
  }, []);

  const openRoom = useCallback(
    (nextSlug: string, opts: { token?: string; tab?: ActiveTab; prefetched?: MatchState } = {}) => {
      if (opts.token) saveAuth(nextSlug, opts.token);
      const auth = opts.token ? { token: opts.token } : readSavedAuth(nextSlug);
      setAdminAuth(auth);
      setSelectedPlayerId(window.localStorage.getItem(`tiratime:player:${nextSlug}`));
      setActiveTab(opts.tab ?? (auth ? 'admin' : 'draw'));
      setHomeError(null);
      if (opts.prefetched) {
        setMatch(opts.prefetched);
        setLoading(false);
      } else {
        setMatch(null);
        setLoading(true);
      }
      setSlug(nextSlug);
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('pelada', nextSlug);
      window.history.pushState({}, '', url.toString());
    },
    []
  );

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const ctx = readUrlContext();
      setSlug(ctx.slug);
      setMatch(null);
      setLoading(Boolean(ctx.slug));
      setAdminAuth(readSavedAuth(ctx.slug));
      setSelectedPlayerId(ctx.slug ? window.localStorage.getItem(`tiratime:player:${ctx.slug}`) : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ---- Data loading -------------------------------------------------------
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchMatch(slug, adminAuth)
      .then((m) => {
        if (cancelled) return;
        setMatch(m);
        rememberMatch({ slug: m.slug, groupName: m.groupName, isOrganizer: m.isAdmin });
        if (adminAuth?.token) {
          if (m.isAdmin) {
            saveAuth(m.slug, adminAuth.token);
          } else {
            // Token expired (PIN was changed) — drop it and ask for PIN again
            window.localStorage.removeItem(`tiratime:admin:${m.slug}`);
            setAdminAuth(undefined);
          }
          const curUrl = new URL(window.location.href);
          if (curUrl.searchParams.has('admin')) {
            curUrl.searchParams.delete('admin');
            window.history.replaceState({}, '', curUrl.toString());
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        goHome(/não encontrad/i.test(msg) ? 'Essa pelada não existe mais ou o código está errado.' : msg || 'Erro ao abrir a pelada.');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, adminAuth, goHome]);

  // Real-time SSE updates + polling fallback (for serverless)
  useEffect(() => {
    if (!slug) return;
    let closed = false;
    const syncLatest = () => {
      if (closed || document.visibilityState === 'hidden') return;
      fetchMatch(slug, adminAuth)
        .then((latest) => {
          if (!closed) {
            setMatch(latest);
          }
        })
        .catch(() => {});
    };

    const es = new EventSource(`/api/matches/${encodeURIComponent(slug)}/events`);
    es.addEventListener('connected', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data || '{}');
        if (data.mode === 'serverless') es.close();
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('match_updated', syncLatest);
    es.addEventListener('player_revealed', syncLatest);
    es.onerror = () => es.close();

    const pollInterval = window.setInterval(syncLatest, 4000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncLatest();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      closed = true;
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      es.close();
    };
  }, [slug, adminAuth]);

  const handleSelectPlayer = (playerId: string | null) => {
    if (!slug) return;
    setSelectedPlayerId(playerId);
    if (playerId) window.localStorage.setItem(`tiratime:player:${slug}`, playerId);
    else window.localStorage.removeItem(`tiratime:player:${slug}`);
  };

  const handleShareLink = async () => {
    if (!match) return;
    const shareUrl = `${window.location.origin}/?pelada=${encodeURIComponent(match.slug)}`;
    const when = [match.meta.dateLabel, match.meta.timeLabel].filter(Boolean).join(' · ');
    const sharePrompt = `${match.groupName}${when ? ` (${when})` : ''}\nEntre no link e descubra seu time:`;
    const shareText = `${sharePrompt} ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${match.groupName} — TiraTime`, text: sharePrompt, url: shareUrl });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Link da pelada copiado! Mande no grupo do WhatsApp.');
    } catch {
      showToast('Copie o endereço do navegador para enviar no grupo.');
    }
  };

  // ---- Render -------------------------------------------------------------
  if (!slug) {
    return (
      <>
        <HomeScreen
          initialError={homeError}
          onCreated={(created) => {
            rememberMatch({ slug: created.slug, groupName: created.groupName, isOrganizer: true });
            openRoom(created.slug, { token: created.adminToken, tab: 'admin', prefetched: created });
            showToast(`Pelada criada! Código da sala: ${created.slug}`);
          }}
          onOpen={(nextSlug, groupName, token) => {
            rememberMatch({ slug: nextSlug, groupName, isOrganizer: Boolean(token) });
            openRoom(nextSlug, { token });
            if (token) showToast('Painel do organizador desbloqueado.');
          }}
        />
        {toast && <Toast message={toast} />}
      </>
    );
  }

  if (loading || !match) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--gold-trophy)] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm font-medium text-[var(--ink-sage)]">Carregando vestiário do TiraTime...</p>
      </main>
    );
  }

  const isEmptyRoster = match.players.length === 0;

  return (
    <div className="min-h-[100dvh] flex flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <MatchHeader
        match={match}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onShareLink={handleShareLink}
        onGoHome={() => goHome()}
      />

      <main className="flex-1">
        {activeTab !== 'admin' && isEmptyRoster ? (
          <EmptyRosterNotice isAdmin={match.isAdmin} onGoToAdmin={() => setActiveTab('admin')} />
        ) : (
          <>
            {activeTab === 'draw' && (
              <PlayerDrawTab
                match={match}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={handleSelectPlayer}
                onMatchUpdated={setMatch}
                onGoToTeams={() => setActiveTab('teams')}
                soundEnabled={soundEnabled}
              />
            )}

            {activeTab === 'teams' && <TeamsBoardTab match={match} adminAuth={adminAuth} onToast={showToast} />}
          </>
        )}

        {activeTab === 'admin' && (
          <OrganizerTab
            match={match}
            adminAuth={adminAuth}
            onAuthenticated={(token, _pin, nextMatch) => {
              saveAuth(nextMatch.slug, token);
              rememberMatch({ slug: nextMatch.slug, groupName: nextMatch.groupName, isOrganizer: true });
              setAdminAuth({ token });
              setMatch(nextMatch);
            }}
            onMatchUpdated={(nextMatch) => {
              setMatch(nextMatch);
              rememberMatch({ slug: nextMatch.slug, groupName: nextMatch.groupName });
            }}
            onGoHome={() => goHome()}
            onToast={showToast}
          />
        )}
      </main>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-slide fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-xl border border-[var(--gold-trophy)]/40 bg-[#0A251A]/95 backdrop-blur-md px-4 py-2.5 text-sm font-semibold text-[var(--ink-chalk)] shadow-2xl"
    >
      {message}
    </div>
  );
}

function EmptyRosterNotice({ isAdmin, onGoToAdmin }: { isAdmin: boolean; onGoToAdmin: () => void }) {
  return (
    <section className="max-w-md mx-auto px-4 py-10">
      <div className="rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-[var(--gold-trophy)]/15 border border-[var(--gold-trophy)]/35 flex items-center justify-center text-[var(--gold-trophy)]">
          {isAdmin ? <ClipboardList className="w-6 h-6" /> : <Hourglass className="w-6 h-6" />}
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
          A lista ainda está vazia
        </h2>
        <p className="mt-1.5 text-sm text-[var(--ink-sage)]">
          {isAdmin
            ? 'Cole a lista do WhatsApp ou adicione os jogadores no painel do organizador para liberar o sorteio.'
            : 'O organizador ainda não montou a lista desta pelada. Volte daqui a pouco!'}
        </p>
        <button
          type="button"
          onClick={onGoToAdmin}
          className={
            isAdmin
              ? 'tappable hover-gold mt-5 h-11 px-5 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm'
              : 'tappable hover-surface mt-5 h-10 px-4 rounded-xl border border-[var(--chalk-line)] bg-[#071A12] text-xs font-semibold text-[var(--gold-trophy)]'
          }
        >
          {isAdmin ? 'Montar a lista agora' : 'Sou o organizador · Montar lista'}
        </button>
      </div>
    </section>
  );
}
