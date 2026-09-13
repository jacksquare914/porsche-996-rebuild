import { useCallback, useEffect, useRef, useState } from 'react';
import type { RebuildState } from './types';
import { emptyState } from './types';
import { StoreContext, type StoreApi } from './store';
import * as drive from './drive';
import { Icon } from './ui';
import Build from './views/Build';
import Parts from './views/Parts';
import Log from './views/Log';
import Prices from './views/Prices';
import Content from './views/Content';

const TABS = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'parts', label: 'Parts', icon: 'parts' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'prices', label: 'Prices', icon: 'price' },
  { id: 'content', label: 'Content', icon: 'content' },
] as const;

type TabId = (typeof TABS)[number]['id'];
const LOCAL_KEY = 'p996_state_cache';

function merge(base: RebuildState, loaded: Partial<RebuildState> | null): RebuildState {
  if (!loaded) return base;
  return {
    ...base,
    ...loaded,
    car: { ...base.car, ...(loaded.car ?? {}) },
    steps: loaded.steps ?? {},
    parts: loaded.parts ?? {},
    quotes: loaded.quotes ?? [],
    log: loaded.log ?? [],
    content: loaded.content ?? [],
  };
}

export default function App() {
  const [tab, setTab] = useState<TabId>(
    () => (location.hash.slice(1) as TabId) || 'build',
  );
  const [state, setState] = useState<RebuildState>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_KEY);
      if (cached) return merge(emptyState(), JSON.parse(cached));
    } catch { /* cache is best-effort */ }
    return emptyState();
  });
  const [status, setStatus] = useState<StoreApi['status']>('signed-out');
  const [statusMessage, setStatusMessage] = useState<string>();
  const [openPart, setOpenPart] = useState<string | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<number>(0);

  useEffect(() => {
    const onHash = () => setTab((location.hash.slice(1) as TabId) || 'build');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const pull = useCallback(async () => {
    setStatus('syncing');
    setStatusMessage(undefined);
    try {
      const loaded = await drive.loadState<RebuildState>();
      setState((cur) => {
        // Drive wins unless we have unsaved local edits that are newer.
        if (loaded && dirty.current && cur.updated_at > (loaded.updated_at ?? '')) return cur;
        const next = merge(emptyState(), loaded);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        return next;
      });
      setStatus('synced');
    } catch (e) {
      setStatus('error');
      setStatusMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const signIn = useCallback(async () => {
    try {
      setStatus('syncing');
      await drive.signIn(true);
      await pull();
    } catch (e) {
      setStatus('error');
      setStatusMessage(e instanceof Error ? e.message : String(e));
    }
  }, [pull]);

  // Try a silent restore on load.
  useEffect(() => {
    if (!drive.isConfigured()) {
      setStatus('local');
      setStatusMessage('No Google client ID configured — running on this device only.');
      return;
    }
    if (drive.restoreSession()) {
      pull();
    } else {
      drive.signIn(false).then(pull).catch(() => setStatus('signed-out'));
    }
  }, [pull]);

  const update = useCallback((fn: (d: RebuildState) => void) => {
    setState((cur) => {
      const draft: RebuildState = structuredClone(cur);
      fn(draft);
      draft.updated_at = new Date().toISOString();
      dirty.current = true;
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(draft)); } catch { /* quota */ }
      return draft;
    });
  }, []);

  // Debounced push to Drive.
  useEffect(() => {
    if (!dirty.current || !drive.isSignedIn()) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus('syncing');
      try {
        await drive.saveState(state);
        dirty.current = false;
        setStatus('synced');
        setStatusMessage(undefined);
      } catch (e) {
        setStatus('error');
        setStatusMessage(e instanceof Error ? e.message : String(e));
      }
    }, 1200) as unknown as number;
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, []);

  const api: StoreApi = {
    state, update, status, statusMessage,
    signIn: () => { void signIn(); },
    signOut: () => { drive.signOut(); setStatus('signed-out'); },
    reload: () => { void pull(); },
  };

  const h = drive.currentHandles();

  return (
    <StoreContext.Provider value={api}>
      <div className="app">
        <header className="topbar">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>2003 996 Targa · M96.03 3.6</h1>
            <div className="sub">Engine-out rebuild</div>
          </div>
          <div className={`sync ${status}`}>
            <span className="dot" />
            {status === 'synced' ? 'Drive' :
             status === 'syncing' ? 'Syncing' :
             status === 'error' ? 'Error' :
             status === 'local' ? 'Local' : 'Signed out'}
          </div>
          {status === 'signed-out' || status === 'error' ? (
            <button className="btn sm primary" onClick={() => void signIn()}>Connect Drive</button>
          ) : h ? (
            <a className="btn sm ghost" href={drive.folderUrl(h.rootId)} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none' }} aria-label="Open Drive folder">
              <span style={{ width: 14, height: 14, display: 'block' }}><Icon name="ext" /></span>
            </a>
          ) : null}
        </header>

        <main>
          {statusMessage && (
            <div className={`banner ${status === 'error' ? 'bad' : 'warn'}`}>
              {statusMessage}
              {status === 'error' && (
                <> <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => void pull()}>Retry</button></>
              )}
            </div>
          )}
          {status === 'signed-out' && (
            <div className="banner warn">
              Not connected to Drive — changes are kept in this browser only.
              Connect to sync across your phone and laptop.
            </div>
          )}

          {tab === 'build' && <Build onOpenPart={(id) => { setOpenPart(id); location.hash = 'parts'; }} />}
          {tab === 'parts' && <Parts openId={openPart} setOpenId={setOpenPart} />}
          {tab === 'log' && <Log />}
          {tab === 'prices' && <Prices onOpenPart={(id) => { setOpenPart(id); location.hash = 'parts'; }} />}
          {tab === 'content' && <Content />}
        </main>

        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.id} aria-selected={tab === t.id} onClick={() => { location.hash = t.id; }}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </StoreContext.Provider>
  );
}
