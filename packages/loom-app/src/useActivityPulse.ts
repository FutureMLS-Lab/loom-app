import { useCallback, useEffect, useRef, useState } from 'react';

import type { LoomClient } from './loomClient';
import type { ActivityPulse, ActivitySnapshot } from './types';

/** Matches the server's own watcher cadence; faster just burns battery. */
const POLL_MS = 4000;

type Options = {
  client: LoomClient;
  /** Skip polling while backgrounded so the app stops waking the radio. */
  active: boolean;
};

export function useActivityPulse({ client, active }: Options) {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>({});
  // Acked locally so the indicator clears immediately, before the next poll
  // round-trips and stops reporting the finish.
  const ackedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await client.activity();
        if (!cancelled) setSnapshot(next);
      } catch {
        // A dropped poll is not worth surfacing; the next one will retry.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, client]);

  const pulseFor = useCallback(
    (projectId: string, slug: string): ActivityPulse => {
      const key = `${projectId}/${slug}`;
      const entry = snapshot.tasks?.[key];
      if (!entry) return 'idle';
      if (entry.working) return 'working';
      if (entry.finished_at && !ackedRef.current.has(key)) return 'finished';
      return 'idle';
    },
    [snapshot],
  );

  const projectPulse = useCallback(
    (projectId: string): ActivityPulse => {
      const counts = snapshot.projects?.[projectId];
      if (!counts) return 'idle';
      // An unseen finish outranks a running agent: it is the one that needs
      // the user to go somewhere, rather than just reporting progress.
      const unseen = Object.entries(snapshot.tasks || {}).some(
        ([key, task]) =>
          task.project === projectId &&
          task.finished_at &&
          !ackedRef.current.has(key),
      );
      if (unseen) return 'finished';
      return counts.working > 0 ? 'working' : 'idle';
    },
    [snapshot],
  );

  const acknowledge = useCallback(
    (projectId: string, slug: string) => {
      if (!projectId || !slug) return;
      const key = `${projectId}/${slug}`;
      if (ackedRef.current.has(key)) return;
      ackedRef.current.add(key);
      setSnapshot((current) => ({ ...current }));
      void client.ackActivity(projectId, slug).catch(() => {});
    },
    [client],
  );

  return { pulseFor, projectPulse, acknowledge };
}
