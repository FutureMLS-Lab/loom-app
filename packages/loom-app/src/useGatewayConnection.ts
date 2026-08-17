import { useCallback, useMemo, useState } from 'react';

import {
  DEFAULT_GATEWAY_AUTH_TOKEN,
  DEFAULT_GATEWAY_URL,
  isLocalGatewayUrl,
  LoomClient,
} from './loomClient';
import {
  buildDefaultServer,
  createServer,
  type LoomServer,
  normalizeUrl,
  parseStored,
  persistServers,
} from './servers';

export { ACTIVE_SERVER_KEY, GATEWAY_URL_KEY, SERVERS_KEY } from './servers';

type Options = {
  /** Persisting before hydration finishes would clobber the stored value. */
  hydrated: boolean;
  /** Called when a switch begins, so the caller can show its loading state. */
  onSwitchStart: () => void;
  /** Called instead of a switch when the target server is already active. */
  onReload: () => void;
};

export function useGatewayConnection({
  hydrated,
  onSwitchStart,
  onReload,
}: Options) {
  const [servers, setServers] = useState<LoomServer[]>(() => [buildDefaultServer()]);
  const [activeId, setActiveId] = useState('default');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  const activeServer =
    servers.find((server) => server.id === activeId) || servers[0] || buildDefaultServer();
  const baseUrl = activeServer.url;
  // The token that ships with the build still covers the default server, so a
  // fresh install keeps working without anyone typing one in.
  const authToken = activeServer.token || DEFAULT_GATEWAY_AUTH_TOKEN;

  const client = useMemo(
    () => new LoomClient(baseUrl, authToken),
    [authToken, baseUrl],
  );
  const defaultClient = useMemo(
    () => new LoomClient(DEFAULT_GATEWAY_URL, DEFAULT_GATEWAY_AUTH_TOKEN),
    [],
  );

  const commit = useCallback(
    (nextServers: LoomServer[], nextActiveId: string) => {
      setServers(nextServers);
      setActiveId(nextActiveId);
      if (hydrated) void persistServers(nextServers, nextActiveId);
    },
    [hydrated],
  );

  /** Persists the active server's URL after it proved reachable. */
  const persist = useCallback(
    (nextBaseUrl: string) => {
      if (!hydrated) return;
      const normalized = normalizeUrl(nextBaseUrl);
      const nextServers = servers.map((server) =>
        server.id === activeId ? { ...server, url: normalized } : server,
      );
      void persistServers(nextServers, activeId);
    },
    [activeId, hydrated, servers],
  );

  /** Loads the stored list, migrating an install that predates it. */
  const adoptStored = useCallback(
    (
      rawServers: string | null | undefined,
      rawActiveId: string | null | undefined,
      legacyUrl: string | null | undefined,
    ) => {
      const stored = parseStored(rawServers, rawActiveId, legacyUrl);
      // A local address saved against a remote build came from another
      // machine's setup and can never be reached from a phone.
      const usable = stored.servers.filter(
        (server) =>
          !isLocalGatewayUrl(server.url) || isLocalGatewayUrl(DEFAULT_GATEWAY_URL),
      );
      const nextServers = usable.length ? usable : [buildDefaultServer()];
      const nextActiveId = nextServers.some((server) => server.id === stored.activeId)
        ? stored.activeId
        : nextServers[0].id;
      setServers(nextServers);
      setActiveId(nextActiveId);
    },
    [],
  );

  /** Adopts a URL that already proved reachable, without a reload round-trip. */
  const applyBaseUrl = useCallback(
    (next: string) => {
      const normalized = normalizeUrl(next);
      setServers((current) => {
        const match = current.find((server) => server.url === normalized);
        if (match) {
          setActiveId(match.id);
          return current;
        }
        return current.map((server) =>
          server.id === activeId ? { ...server, url: normalized } : server,
        );
      });
    },
    [activeId],
  );

  /** Switching drops the previous server's data; the caller reloads from here. */
  const selectServer = useCallback(
    (id: string) => {
      onSwitchStart();
      if (id === activeId) {
        onReload();
        return;
      }
      const next = servers.find((server) => server.id === id);
      if (!next) return;
      setActiveId(id);
      setError('');
      if (hydrated) void persistServers(servers, id);
    },
    [activeId, hydrated, onReload, onSwitchStart, servers],
  );

  const saveServer = useCallback(
    (draft: LoomServer) => {
      const url = normalizeUrl(draft.url);
      if (!/^https?:\/\//i.test(url)) return false;
      const next: LoomServer = { ...draft, url };
      const exists = servers.some((server) => server.id === next.id);
      const nextServers = exists
        ? servers.map((server) => (server.id === next.id ? next : server))
        : [...servers, next];
      const switching = next.id !== activeId;
      const changedActive = !switching && next.url !== baseUrl;
      onSwitchStart();
      commit(nextServers, next.id);
      if (!switching && !changedActive) onReload();
      setError('');
      return true;
    },
    [activeId, baseUrl, commit, onReload, onSwitchStart, servers],
  );

  const removeServer = useCallback(
    (id: string) => {
      if (servers.length <= 1) return;
      const nextServers = servers.filter((server) => server.id !== id);
      const nextActiveId = id === activeId ? nextServers[0].id : activeId;
      if (id === activeId) onSwitchStart();
      commit(nextServers, nextActiveId);
    },
    [activeId, commit, onSwitchStart, servers],
  );

  const reset = useCallback(() => {
    const fallback = buildDefaultServer();
    const existing = servers.find((server) => server.url === fallback.url);
    onSwitchStart();
    setError('');
    if (existing) {
      commit(servers, existing.id);
      return;
    }
    commit([...servers, fallback], fallback.id);
  }, [commit, onSwitchStart, servers]);

  return {
    servers,
    activeId,
    activeServer,
    baseUrl,
    authToken,
    expanded,
    setExpanded,
    error,
    setError,
    client,
    defaultClient,
    persist,
    adoptStored,
    applyBaseUrl,
    selectServer,
    saveServer,
    removeServer,
    createServer,
    reset,
  };
}
