import { useCallback, useRef, useState } from 'react';

import type { LoomClient } from './loomClient';
import type { TerminalKey } from './types';

export type TerminalStreamState = 'connecting' | 'live' | 'paused' | 'error';

const INITIAL_CAPTURE_LINES = 180;
export const MAX_CAPTURE_LINES = 500;
/** Keys queued beyond this are dropped, so a held key cannot flood the pane. */
const MAX_QUEUED_KEYS = 6;
/** Lets the pane redraw before the refresh that reads it back. */
const KEY_SETTLE_MS = 45;

type Options = {
  client: LoomClient;
  /** Re-reads the pane after a key lands; defined by the caller's data layer. */
  onRefresh: () => void;
};

export function useTerminalSession({ client, onRefresh }: Options) {
  const [streamState, setStreamState] =
    useState<TerminalStreamState>('connecting');
  const [keyPending, setKeyPending] = useState(0);
  const [lastKey, setLastKey] = useState<TerminalKey | null>(null);
  const [keyError, setKeyError] = useState('');
  const [keysOpen, setKeysOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [blurRequest, setBlurRequest] = useState(0);
  const [taskKey, setTaskKey] = useState('');
  const [captureLines, setCaptureLines] = useState(INITIAL_CAPTURE_LINES);

  const targetRef = useRef('');
  const captureLinesRef = useRef(INITIAL_CAPTURE_LINES);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const generationRef = useRef(0);

  /** Invalidates in-flight keys so they cannot land on the next selection. */
  const dropQueuedKeys = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = Promise.resolve();
  }, []);

  const resetForSelection = useCallback(() => {
    captureLinesRef.current = INITIAL_CAPTURE_LINES;
    setCaptureLines(INITIAL_CAPTURE_LINES);
    setKeyError('');
    setLastKey(null);
    setKeysOpen(true);
    setFullscreen(false);
    setStreamState('connecting');
    setFocused(false);
    dropQueuedKeys();
  }, [dropQueuedKeys]);

  const requestBlur = useCallback(() => {
    setBlurRequest((current) => current + 1);
  }, []);

  /** Doubles the capture window; returns false once the cap is reached. */
  const growCapture = useCallback(() => {
    const next = Math.min(captureLinesRef.current * 2, MAX_CAPTURE_LINES);
    if (next === captureLinesRef.current) return false;
    captureLinesRef.current = next;
    setCaptureLines(next);
    return true;
  }, []);

  const sendKey = useCallback(
    (key: TerminalKey) => {
      const target = targetRef.current;
      if (!target) {
        setKeyError('No active terminal target is available.');
        return;
      }
      if (streamState !== 'live') {
        setKeyError('Terminal is not connected yet.');
        return;
      }
      // Interrupts jump the queue; everything else respects the backlog cap.
      if (key === 'Escape' || key === 'C-c') {
        dropQueuedKeys();
      } else if (pendingRef.current >= MAX_QUEUED_KEYS) {
        setKeyError('Keys are catching up — pause a beat, then continue.');
        return;
      }
      const generation = generationRef.current;

      setLastKey(key);
      setKeyError('');
      pendingRef.current += 1;
      setKeyPending(pendingRef.current);

      queueRef.current = queueRef.current
        .then(async () => {
          if (generation !== generationRef.current) return;
          if (targetRef.current !== target) return;
          await client.sendKey(target, key);
          await new Promise((resolve) => setTimeout(resolve, KEY_SETTLE_MS));
          if (targetRef.current === target) onRefresh();
        })
        .catch((error) => {
          if (targetRef.current === target) {
            setKeyError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          pendingRef.current = Math.max(0, pendingRef.current - 1);
          setKeyPending(pendingRef.current);
        });
    },
    [client, dropQueuedKeys, onRefresh, streamState],
  );

  return {
    streamState,
    setStreamState,
    keyPending,
    lastKey,
    keyError,
    keysOpen,
    setKeysOpen,
    fullscreen,
    setFullscreen,
    focused,
    setFocused,
    blurRequest,
    requestBlur,
    taskKey,
    setTaskKey,
    captureLines,
    captureLinesRef,
    targetRef,
    growCapture,
    resetForSelection,
    sendKey,
  };
}
