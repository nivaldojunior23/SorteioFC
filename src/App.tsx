import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchHeader, type ActiveTab } from './components/MatchHeader';
import { PlayerDrawTab } from './components/PlayerDrawTab';
import { TeamsBoardTab } from './components/TeamsBoardTab';
import { OrganizerTab } from './components/OrganizerTab';
import { fetchMatch, fetchMatches, type AdminAuth } from './lib/api';
import type { MatchState, MatchSummary } from './types';

function readUrlContext() {
  if (typeof window === 'undefined') return { slug: 'pelada-principal', adminToken: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    slug: params.get('pelada') || 'pelada-principal',
    adminToken: params.get('admin') || ''
  };
}

export function App() {
  const initialCtx = readUrlContext();
  const [slug, setSlug] = useState<string>(initialCtx.slug);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    initialCtx.adminToken ? 'admin' : 'draw'
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(`tiratime:player:${initialCtx.slug}`);
  });
  const [adminAuth, setAdminAuth] = useState<AdminAuth | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    if (initialCtx.adminToken) {
      return { token: initialCtx.adminToken };
    }
    const saved = window.localStorage.getItem(`tiratime:admin:${initialCtx.slug}`);
    if (!saved) return undefined;
    try {
      const parsed = JSON.parse(saved) as AdminAuth;
      return parsed?.token ? { token: parsed.token } : undefined;
    } catch {
      return undefined;
    }
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [liveConnected, setLiveConnected] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadData = useCallback(async (targetSlug: string, auth?: AdminAuth) => {
    try {
      const all = await fetchMatches();
      let resolvedSlug = targetSlug;
      let effectiveAuth = auth;
      let m: MatchState;
      try {
        m = await fetchMatch(resolvedSlug, effectiveAuth);
      } catch (err) {
        if (all.length > 0 && !new URLSearchParams(window.location.search).get('pelada')) {
          resolvedSlug = all[0].slug;
          if (!effectiveAuth) {
            const saved = window.localStorage.getItem(`tiratime:admin:${resolvedSlug}`);
            if (saved) {
              try {
                const parsed = JSON.parse(saved) as AdminAuth;
                if (parsed?.token) {
                  effectiveAuth = { token: parsed.token };
                  setAdminAuth(effectiveAuth);
                }
              } catch {
                // ignore invalid saved auth
              }
            }
          }
          setSlug(resolvedSlug);
          m = await fetchMatch(resolvedSlug, effectiveAuth);
        } else {
          throw err;
        }
      }
      setMatch(m);
      setMatches(all);
      setError(null);
      if (effectiveAuth?.token && m.isAdmin) {
        window.localStorage.setItem(
          `tiratime:admin:${resolvedSlug}`,
          JSON.stringify({ token: effectiveAuth.token })
        );
        const curUrl = new URL(window.location.href);
        if (curUrl.searchParams.has('admin')) {
          curUrl.searchParams.delete('admin');
          window.history.replaceState({}, '', curUrl.toString());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pelada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData(slug, adminAuth);
  }, [slug, adminAuth, loadData]);

  // Real-time SSE updates + serverless polling fallback (for Vercel)
  useEffect(() => {
    let closed = false;
    const syncLatest = () => {
      if (closed || document.visibilityState === 'hidden') return;
      fetchMatch(slug, adminAuth)
        .then((latest) => {
          if (!closed) {
            setMatch(latest);
            setLiveConnected(true);
          }
        })
        .catch(() => {});
    };

    const es = new EventSource(`/api/matches/${encodeURIComponent(slug)}/events`);
    es.addEventListener('connected', (ev) => {
      setLiveConnected(true);
      try {
        const data = JSON.parse((ev as MessageEvent).data || '{}');
        if (data.mode === 'serverless') {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('match_updated', syncLatest);
    es.addEventListener('player_revealed', syncLatest);
    es.onerror = () => {
      es.close();
    };

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
    setSelectedPlayerId(playerId);
    if (playerId) {
      window.localStorage.setItem(`tiratime:player:${slug}`, playerId);
    } else {
      window.localStorage.removeItem(`tiratime:player:${slug}`);
    }
  };

  const handleShareLink = async () => {
    if (!match) return;
    const shareUrl = `${window.location.origin}/?pelada=${encodeURIComponent(match.slug)}`;
    const shareText = `⚽ Sorteio ${match.groupName} (${match.meta.dateLabel} · ${match.meta.timeLabel})\nEntre no link e descubra seu time: ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${match.groupName} — Sorteio`,
          text: shareText,
          url: shareUrl
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link da pelada copiado! Mande no grupo do WhatsApp.');
    } catch {
      showToast('Copie o endereço do navegador para enviar no grupo.');
    }
  };

  const handleSwitchMatch = (nextSlug: string) => {
    const savedAuth = window.localStorage.getItem(`tiratime:admin:${nextSlug}`);
    let nextAuth: AdminAuth | undefined;
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth) as AdminAuth;
        if (parsed?.token) nextAuth = { token: parsed.token };
      } catch {
        nextAuth = undefined;
      }
    }
    setAdminAuth(nextAuth);
    setSelectedPlayerId(window.localStorage.getItem(`tiratime:player:${nextSlug}`));
    setSlug(nextSlug);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('pelada', nextSlug);
    nextUrl.searchParams.delete('admin');
    window.history.replaceState({}, '', nextUrl.toString());
  };

  if (loading && !match) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--gold-trophy)] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm font-medium text-[var(--ink-sage)]">
          Carregando vestiário do TiraTime...
        </p>
      </main>
    );
  }

  if (error || !match) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md rounded-2xl border border-[var(--chalk-line)] bg-[var(--bg-locker)] p-6">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--ink-chalk)]">
            Não foi possível abrir a pelada
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-sage)]">{error || 'Pelada não encontrada.'}</p>
          <button
            type="button"
            onClick={() => handleSwitchMatch(matches[0]?.slug || 'pelada-principal')}
            className="tappable hover-gold mt-4 h-10 px-4 rounded-xl bg-[var(--gold-trophy)] text-[#071A12] font-bold text-sm"
          >
            Voltar para Pelada Principal
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <MatchHeader
        match={match}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onShareLink={handleShareLink}
        liveConnected={liveConnected}
      />

      <main className="flex-1">
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

        {activeTab === 'teams' && (
          <TeamsBoardTab match={match} adminAuth={adminAuth} onToast={showToast} />
        )}

        {activeTab === 'admin' && (
          <OrganizerTab
            match={match}
            matches={matches}
            adminAuth={adminAuth}
            onAuthenticated={(token, _pin, nextMatch) => {
              const authPayload: AdminAuth = { token };
              window.localStorage.setItem(
                `tiratime:admin:${nextMatch.slug}`,
                JSON.stringify(authPayload)
              );
              setAdminAuth(authPayload);
              setMatch(nextMatch);
              setSlug(nextMatch.slug);
              fetchMatches().then(setMatches).catch(() => {});
            }}
            onMatchUpdated={(nextMatch) => {
              setMatch(nextMatch);
              fetchMatches().then(setMatches).catch(() => {});
            }}
            onSwitchMatch={handleSwitchMatch}
            onToast={showToast}
          />
        )}
      </main>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-slide fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-xl border border-[var(--gold-trophy)]/40 bg-[#0A251A]/95 backdrop-blur-md px-4 py-2.5 text-sm font-semibold text-[var(--ink-chalk)] shadow-2xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
