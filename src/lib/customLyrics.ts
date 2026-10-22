import type { LyricLine, SongRef } from './types';

const PREFIX = 'singalong:lyrics:';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const key = (track: SongRef) => `${PREFIX}${normalize(track.artist)}|${normalize(track.title)}`;

/** Lyrics typed, pasted or tapped by the user, kept on this device per track. */
export function readCustomLyrics(track: SongRef): string | null {
  try {
    const raw = localStorage.getItem(key(track));
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function saveCustomLyrics(track: SongRef, raw: string | null): void {
  try {
    if (raw && raw.trim()) localStorage.setItem(key(track), raw);
    else localStorage.removeItem(key(track));
  } catch {
    /* storage may be unavailable, the lyrics still apply for this load */
  }
}

const stamp = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds * 100) / 100);
  const min = Math.floor(total / 60);
  const sec = Math.floor(total % 60);
  const cent = Math.round((total - Math.floor(total)) * 100);
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cent).padStart(2, '0')}]`;
};

/** Rebuilds an LRC text from the displayed lines, to pre-fill the editor. */
export function linesToLrc(lines: LyricLine[]): string {
  return lines
    .map((line) => (line.t === null ? line.text : `${stamp(line.t)}${line.text}`))
    .join('\n');
}

export { stamp as formatLrcStamp };
