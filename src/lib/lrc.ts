import type { LyricLine } from './types';

/** Index of the last timed line whose timestamp is <= position. */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].t;
    if (t !== null && t <= position) index = i;
  }
  return index;
}

/** Index of the active word inside a line, or -1. */
export function activeWordIndex(line: LyricLine | undefined, position: number): number {
  if (!line?.words?.length) return -1;
  let index = -1;
  for (let i = 0; i < line.words.length; i += 1) {
    if (line.words[i].t <= position) index = i;
  }
  return index;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
