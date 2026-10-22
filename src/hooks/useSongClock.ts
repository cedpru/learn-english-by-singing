import { useCallback, useEffect, useRef, useState } from 'react';

export interface SongClock {
  position: number;
  playing: boolean;
  start: (from?: number) => void;
  pause: () => void;
  resume: () => void;
  nudge: (delta: number) => void;
  /** moves the position without changing the play/pause state */
  seekTo: (position: number) => void;
  reset: () => void;
}

/**
 * A wall-clock timer that estimates where we are inside the song.
 * The position is only ever anchored by user actions (start, resume, nudge),
 * so a slow render or a background tab cannot make it drift.
 */
export function useSongClock(): SongClock {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const anchor = useRef({ pos: 0, at: 0 });

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPosition(anchor.current.pos + (performance.now() - anchor.current.at) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing]);

  const goTo = useCallback((pos: number) => {
    const next = Math.max(0, pos);
    anchor.current = { pos: next, at: performance.now() };
    setPosition(next);
  }, []);

  const start = useCallback(
    (from = 0) => {
      goTo(from);
      setPlaying(true);
    },
    [goTo],
  );

  const pause = useCallback(() => setPlaying(false), []);

  const resume = useCallback(() => {
    anchor.current = { pos: anchor.current.pos, at: performance.now() };
    setPlaying(true);
  }, []);

  const nudge = useCallback(
    (delta: number) => {
      const next = Math.max(0, anchor.current.pos + delta);
      anchor.current = { pos: next, at: performance.now() };
      setPosition(next);
    },
    [],
  );

  const seekTo = useCallback(
    (pos: number) => {
      goTo(pos);
    },
    [goTo],
  );

  const reset = useCallback(() => {
    setPlaying(false);
    goTo(0);
  }, [goTo]);

  return { position, playing, start, pause, resume, nudge, seekTo, reset };
}
