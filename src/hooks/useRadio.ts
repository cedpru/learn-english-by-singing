import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPresets, pollRadio, startRadio, stopRadio } from '../lib/api';
import type { Preset, RadioSession, SongRef } from '../lib/types';

const POLL_MS = 2500;

export interface Radio {
  presets: Preset[];
  session: RadioSession | null;
  url: string;
  name: string;
  starting: boolean;
  error: string | null;
  start: (url: string, name: string) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Watches a radio stream's ICY metadata. Every time the announced song changes
 * it calls `onTrack`, with an estimate of how far we already are into it.
 */
export function useRadio(onTrack: (track: SongRef, startAt: number) => void): Radio {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [session, setSession] = useState<RadioSession | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef('');
  const onTrackRef = useRef(onTrack);
  onTrackRef.current = onTrack;

  useEffect(() => {
    fetchPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  const sessionId = session?.id;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await pollRadio(sessionId);
        if (cancelled) return;
        setSession(next);
        if (!next.artist || !next.title) return;
        const key = `${next.artist}|${next.title}`;
        if (key === lastKey.current) return;
        lastKey.current = key;
        const elapsed = Math.max(0, (Date.now() - (next.changedAt ?? Date.now())) / 1000);
        onTrackRef.current({ artist: next.artist, title: next.title }, elapsed);
      } catch (err) {
        if (cancelled) return;
        const message = (err as Error).message;
        setError(message);
        // the server restarted (or dropped the stream): stop polling a dead session
        if (/session inconnue|HTTP 404/i.test(message)) {
          setSession(null);
          setUrl('');
          setName('');
        }
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId]);

  const start = useCallback(async (nextUrl: string, nextName: string) => {
    setStarting(true);
    setError(null);
    lastKey.current = '';
    try {
      const current = session?.id;
      if (current) await stopRadio(current);
      const created = await startRadio(nextUrl, nextName);
      setSession(created);
      setUrl(nextUrl);
      setName(nextName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }, [session?.id]);

  const stop = useCallback(async () => {
    const current = session?.id;
    lastKey.current = '';
    setSession(null);
    setUrl('');
    setName('');
    if (current) await stopRadio(current).catch(() => undefined);
  }, [session?.id]);

  return { presets, session, url, name, starting, error, start, stop };
}
