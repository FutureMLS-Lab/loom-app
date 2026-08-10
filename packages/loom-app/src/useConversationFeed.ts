import { useCallback, useRef, useState } from 'react';

import type { LoomClient } from './loomClient';
import type { ConversationFeed } from './types';

const INITIAL_MESSAGES = 60;
const MAX_MESSAGES = 500;
/** A poll only needs the tail; a full read is reserved for explicit loads. */
const POLL_MESSAGES = 20;
/** Staggered re-reads that catch an agent reply landing right after a send. */
const BURST_DELAYS_MS = [0, 250, 500, 1000];

type Selection = { projectId: string; slug: string };

type Options = {
  client: LoomClient;
  /** Shared with the other loaders so stale responses can be discarded. */
  selectedRef: { current: Selection };
  /** Runs when there is no selection left to show. */
  onCleared: () => void;
  /** Lets the caller reconcile its own optimistic state against the server. */
  onFeedLoaded: (feed: ConversationFeed) => void;
};

export function useConversationFeed({
  client,
  selectedRef,
  onCleared,
  onFeedLoaded,
}: Options) {
  const [conversation, setConversation] = useState<ConversationFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const limitRef = useRef(INITIAL_MESSAGES);
  const requestRef = useRef(0);
  const inFlightRef = useRef('');

  const clear = useCallback(() => {
    setConversation(null);
    setError('');
  }, []);

  const resetForSelection = useCallback(
    (hasSelection: boolean) => {
      limitRef.current = INITIAL_MESSAGES;
      requestRef.current += 1;
      clear();
      setLoading(hasSelection);
    },
    [clear],
  );

  const load = useCallback(
    async (showLoading = false, updateOnly = false) => {
      const current = selectedRef.current;
      if (!current.projectId || !current.slug) {
        clear();
        setLoading(false);
        onCleared();
        return;
      }
      const requestKey = `${current.projectId}:${current.slug}`;
      if (inFlightRef.current === requestKey) return;
      inFlightRef.current = requestKey;
      const requestId = ++requestRef.current;
      if (showLoading) setLoading(true);

      const stillCurrent = () =>
        requestRef.current === requestId &&
        selectedRef.current.projectId === current.projectId &&
        selectedRef.current.slug === current.slug;

      try {
        const next = await client.conversation(
          current.projectId,
          current.slug,
          updateOnly ? POLL_MESSAGES : limitRef.current,
        );
        if (!stillCurrent()) return;
        setConversation((existing) => {
          if (
            !updateOnly ||
            !existing ||
            existing.session_id !== next.session_id
          ) {
            return next;
          }
          const updates = new Map(next.messages.map((item) => [item.id, item]));
          // Reuse the previous object whenever the poll returned identical
          // content, so memoized rows skip re-parsing their markdown.
          const merged = existing.messages.map((item) => {
            const update = updates.get(item.id);
            if (!update) return item;
            return JSON.stringify(update) === JSON.stringify(item) ? item : update;
          });
          const seen = new Set(merged.map((item) => item.id));
          for (const item of next.messages) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return {
            ...existing,
            ...next,
            messages: merged,
            has_more: existing.has_more || next.has_more,
          };
        });
        onFeedLoaded(next);
        setError('');
      } catch (caught) {
        if (stillCurrent()) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (inFlightRef.current === requestKey) inFlightRef.current = '';
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [clear, client, onCleared, onFeedLoaded, selectedRef],
  );

  const loadOlder = useCallback(() => {
    const next = Math.min(limitRef.current * 2, MAX_MESSAGES);
    if (next === limitRef.current) return;
    limitRef.current = next;
    void load(true);
  }, [load]);

  const refreshBurst = useCallback(() => {
    void (async () => {
      for (const delay of BURST_DELAYS_MS) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        await load(false, true);
      }
    })();
  }, [load]);

  return {
    conversation,
    loading,
    error,
    clear,
    resetForSelection,
    load,
    loadOlder,
    refreshBurst,
  };
}
