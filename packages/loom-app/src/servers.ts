import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_GATEWAY_AUTH_TOKEN, DEFAULT_GATEWAY_URL } from './loomClient';

export type LoomServer = {
  id: string;
  name: string;
  url: string;
  token: string;
};

export const SERVERS_KEY = 'loom-app:servers';
export const ACTIVE_SERVER_KEY = 'loom-app:active-server';
/** The single-gateway setting this list grew out of. */
export const GATEWAY_URL_KEY = 'loom-app:gateway-url';

export function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** The host is what tells two servers apart when the name is left blank. */
export function suggestedName(url: string): string {
  const host = normalizeUrl(url).replace(/^https?:\/\//i, '').split('/')[0];
  return host || 'Loom';
}

export function serverLabel(server: LoomServer | null | undefined): string {
  if (!server) return 'Loom';
  return server.name.trim() || suggestedName(server.url);
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createServer(partial: Partial<LoomServer> = {}): LoomServer {
  const url = normalizeUrl(partial.url || DEFAULT_GATEWAY_URL);
  return {
    id: partial.id || makeId(),
    name: partial.name ?? '',
    url,
    token: partial.token ?? '',
  };
}

function sanitize(value: unknown): LoomServer | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LoomServer>;
  const url = normalizeUrl(String(raw.url || ''));
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: String(raw.id || makeId()),
    name: typeof raw.name === 'string' ? raw.name : '',
    url,
    token: typeof raw.token === 'string' ? raw.token : '',
  };
}

/** The server this build ships with, used to seed a first-run list. */
export function buildDefaultServer(): LoomServer {
  return createServer({
    id: 'default',
    url: DEFAULT_GATEWAY_URL,
    token: DEFAULT_GATEWAY_AUTH_TOKEN,
  });
}

export type StoredServers = {
  servers: LoomServer[];
  activeId: string;
};

/**
 * Reads the list, falling back to the previous single-gateway setting so an
 * existing install keeps the server it was already talking to.
 */
export function parseStored(
  rawServers: string | null | undefined,
  rawActiveId: string | null | undefined,
  legacyUrl: string | null | undefined,
): StoredServers {
  let servers: LoomServer[] = [];
  if (rawServers) {
    try {
      const parsed = JSON.parse(rawServers);
      if (Array.isArray(parsed)) {
        servers = parsed.map(sanitize).filter((item): item is LoomServer => Boolean(item));
      }
    } catch {
      servers = [];
    }
  }

  if (!servers.length) {
    const fallback = buildDefaultServer();
    const migrated = normalizeUrl(legacyUrl || '');
    servers =
      migrated && migrated !== fallback.url
        ? [fallback, createServer({ url: migrated })]
        : [fallback];
  }

  const activeId = servers.some((server) => server.id === rawActiveId)
    ? String(rawActiveId)
    : servers[0].id;

  return { servers, activeId };
}

export async function persistServers(
  servers: LoomServer[],
  activeId: string,
): Promise<void> {
  await AsyncStorage.multiSet([
    [SERVERS_KEY, JSON.stringify(servers)],
    [ACTIVE_SERVER_KEY, activeId],
  ]).catch(() => {});
}
