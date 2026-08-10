import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo, useState } from 'react';

import {
  DEFAULT_GATEWAY_AUTH_TOKEN,
  DEFAULT_GATEWAY_URL,
  isLocalGatewayUrl,
  LoomClient,
} from './loomClient';

export const GATEWAY_URL_KEY = 'loom-app:gateway-url';

function normalize(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

type Options = {
  /** Persisting before hydration finishes would clobber the stored value. */
  hydrated: boolean;
  /** Called when a switch begins, so the caller can show its loading state. */
  onSwitchStart: () => void;
  /** Called instead of a switch when the target URL is already active. */
  onReload: () => void;
};

export function useGatewayConnection({
  hydrated,
  onSwitchStart,
  onReload,
}: Options) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_GATEWAY_URL);
  const [draft, setDraft] = useState(DEFAULT_GATEWAY_URL);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  const client = useMemo(
    () => new LoomClient(baseUrl, DEFAULT_GATEWAY_AUTH_TOKEN),
    [baseUrl],
  );
  const defaultClient = useMemo(
    () => new LoomClient(DEFAULT_GATEWAY_URL, DEFAULT_GATEWAY_AUTH_TOKEN),
    [],
  );

  const persist = useCallback(
    (nextBaseUrl: string) => {
      if (!hydrated) return;
      void AsyncStorage.setItem(GATEWAY_URL_KEY, nextBaseUrl).catch(() => {});
    },
    [hydrated],
  );

  /** Applies a stored URL, discarding one that this build can never reach. */
  const adoptStored = useCallback((stored: string | null | undefined) => {
    const saved = stored ? normalize(stored) : '';
    if (!saved) return;
    // A local address stored against a remote default is a leftover from
    // another machine's setup and can never connect from here.
    const stale =
      isLocalGatewayUrl(saved) && !isLocalGatewayUrl(DEFAULT_GATEWAY_URL);
    if (/^https?:\/\//i.test(saved) && !stale) {
      setBaseUrl(saved);
      setDraft(saved);
      return;
    }
    void AsyncStorage.removeItem(GATEWAY_URL_KEY).catch(() => {});
  }, []);

  /** Adopts a URL that already proved reachable, without a reload round-trip. */
  const applyBaseUrl = useCallback((next: string) => {
    const normalized = normalize(next);
    setBaseUrl(normalized);
    setDraft(normalized);
  }, []);

  const switchTo = useCallback(
    (nextBaseUrl: string) => {
      onSwitchStart();
      if (nextBaseUrl === baseUrl) {
        onReload();
        return;
      }
      setBaseUrl(nextBaseUrl);
    },
    [baseUrl, onReload, onSwitchStart],
  );

  const connect = useCallback(() => {
    const next = normalize(draft);
    if (next) switchTo(next);
  }, [draft, switchTo]);

  const reset = useCallback(() => {
    void AsyncStorage.removeItem(GATEWAY_URL_KEY).catch(() => {});
    setDraft(defaultClient.baseUrl);
    setError('');
    switchTo(defaultClient.baseUrl);
  }, [defaultClient.baseUrl, switchTo]);

  return {
    baseUrl,
    draft,
    setDraft,
    expanded,
    setExpanded,
    error,
    setError,
    client,
    defaultClient,
    persist,
    adoptStored,
    applyBaseUrl,
    connect,
    reset,
  };
}
