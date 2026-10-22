import type { LyricLine, LyricWord, SongRef } from './types.js';

const LRCLIB = 'https://lrclib.net/api';
const UA = 'SingAlong/0.1 (personal karaoke assistant)';

export interface LrcLibResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  hasWordSync?: boolean;
}

/**
 * Strips "Artist - ", "(Official Video)", "[Site][01 Title]" and similar noise
 * from uploaded titles. LRCLIB is a community database: the same song is often
 * uploaded as "Roar", "06 Katy Perry - Roar" and "[Katy Perry][01 Roar][i-funbox.com]".
 */
export function cleanTitle(artist: string, title: string): string {
  let clean = title.replace(/\s+/g, ' ').trim();
  // A title made only of tags: "[Katy Perry][01 Roar][i-funbox.com]" — keep the
  // group that is neither the artist nor a mirror's domain.
  if (/^(?:\[[^\]]{1,60}\]\s*)+$/.test(clean)) {
    const groups = [...clean.matchAll(/\[([^\]]{1,60})\]/g)].map((m) => m[1].trim()).filter(Boolean);
    const keep = groups.find(
      (group) =>
        normalize(group) !== normalize(artist) &&
        !normalize(group).includes(normalize(artist)) &&
        !/^https?:/i.test(group) &&
        !/^[\w-]+\.[a-z]{2,4}$/i.test(group) &&
        /[a-z]{2,}/i.test(group),
    );
    if (keep) clean = keep;
  }
  // leading upload tags: "[Katy Perry][01 Roar] Roar"
  clean = clean.replace(/^(?:\[[^\]]{1,40}\]\s*)+/, '').trim();
  clean = clean
    .replace(/[(\[][^)\]]*(official|lyrics?|audio|video|visuali[sz]er|remaster\w*|hq|hd|mv|clip|paroles|letra|colou?r coded)[^)\]]*[)\]]/gi, '')
    .trim();

  const norm = (value: string) => normalize(value).replace(/\s+/g, '');
  // "01. Roar", "06 - Roar" and zero-padded track numbers: "06 Roar"
  clean = clean.replace(/^\d{1,3}\s*[.)\-–—]\s*(?=\S)/, '').replace(/^0\d{1,2}\s+(?=\S{2,})/, '').trim();

  for (let i = 0; i < 2; i += 1) {
    const match = /^(.{2,80}?)\s*[-–—]\s*(.+)$/.exec(clean);
    if (!match) break;
    // "06 Katy Perry" still names the artist, track number included
    const prefix = norm(match[1]).replace(/^\d{1,3}/, '');
    const rest = match[2].trim();
    if (prefix === norm(artist) || (prefix.length > 2 && norm(artist).includes(prefix))) {
      clean = rest;
    } else break;
  }

  // trailing artist echo: "Roar Katy Perry"
  const artistWords = normalize(artist).split(' ').filter(Boolean);
  const words = clean.split(' ');
  if (artistWords.length && words.length > artistWords.length) {
    const tail = normalize(words.slice(-artistWords.length).join(' '));
    if (tail === artistWords.join(' ')) {
      clean = words.slice(0, -artistWords.length).join(' ').trim();
    }
  }

  return clean.replace(/[\s\-–—]+$/, '').trim() || title.trim();
}

/** "Katy Perry - Topic" and "Katy Perry (Official)" are the same singer. */
function artistKey(artist: string): string {
  return (
    normalize(artist.replace(/\s*[-–—]\s*(topic|vevo|official).*$/i, '').replace(/\([^)]*\)/g, '')) ||
    normalize(artist)
  );
}

export interface SearchEntry {
  id: number;
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  synced: boolean;
  instrumental: boolean;
}

/**
 * Collapses the many uploads of one song into a single line, keeping the best
 * copy: time-synced first, then the shortest (cleanest) title, then the original
 * upload order so results stay stable between searches.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Candidate {
  entry: SearchEntry;
  hasLyrics: boolean;
  wordSync: boolean;
  order: number;
}

export function uniqueResults(results: LrcLibResult[]): SearchEntry[] {
  const groups = new Map<string, Candidate[]>();

  results.forEach((result, order) => {
    const title = cleanTitle(result.artistName, result.trackName);
    const key = `${normalize(title)}|${artistKey(result.artistName)}`;
    if (!normalize(title)) return;
    const candidate: Candidate = {
      entry: {
        id: result.id,
        artist: result.artistName.replace(/\s*[-–—]\s*(topic|vevo)\s*$/i, '').trim(),
        title,
        album: result.albumName,
        duration: result.duration,
        synced: !!result.syncedLyrics,
        instrumental: !!result.instrumental,
      },
      hasLyrics: !!(result.syncedLyrics || result.plainLyrics),
      wordSync: !!result.hasWordSync,
      order,
    };
    const list = groups.get(key);
    if (list) list.push(candidate);
    else groups.set(key, [candidate]);
  });

  const picked: Candidate[] = [];
  for (const list of groups.values()) {
    const durations = list.map((c) => c.entry.duration).filter((d): d is number => !!d);
    // Video edits run ~20% longer than the album cut (spoken intro, long outro),
    // and their timestamps are shifted: stay near the typical length.
    const centre = durations.length >= 3 ? median(durations) : null;
    // Radios and albums use the short cut: among plausible lengths keep the
    // shortest, which is the album/radio mix rather than a video edit with a
    // spoken intro and a long outro (their timestamps are shifted). Entries far
    // below the typical length are promos or truncated uploads, and are dropped.
    const usable = (c: Candidate) => !!centre && !!c.entry.duration && c.entry.duration >= centre * 0.75;
    const ranked = [...list].sort((a, b) => {
      const quality = (c: Candidate) =>
        [Number(c.entry.synced), Number(c.wordSync), Number(c.hasLyrics)].join();
      const byQuality = quality(b).localeCompare(quality(a));
      if (byQuality) return byQuality;
      const usableDiff = Number(usable(b)) - Number(usable(a));
      if (usableDiff) return usableDiff;
      if (usable(a) && usable(b)) {
        const byLength = (a.entry.duration as number) - (b.entry.duration as number);
        if (byLength) return byLength;
      }
      return a.order - b.order;
    });
    picked.push(ranked[0]);
  }

  return picked
    .sort((a, b) => a.order - b.order)
    .map((c) => c.entry)
    .slice(0, 20);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((feat|ft|with)[^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TIME = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TIME = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function stamp(min: string, sec: string, frac?: string): number {
  const f = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) / 1000 : 0;
  return Number(min) * 60 + Number(sec) + f;
}

/**
 * Parses plain LRC as well as "enhanced" LRC (word level `<mm:ss.xx>` markers).
 * Lines without timestamps are kept with `t: null` so the UI can still show them.
 */
export function parseLrc(raw: string): { lines: LyricLine[]; synced: boolean; wordSync: boolean } {
  const lines: LyricLine[] = [];
  let synced = false;
  let wordSync = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^\[(ar|ti|al|by|offset|re|ve|length):/i.test(line)) continue;

    const times: number[] = [];
    TIME.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIME.exec(line))) {
      if (m.index > 0 && line.slice(0, m.index).trim() !== '') break;
      times.push(stamp(m[1], m[2], m[3]));
    }

    let text = line.replace(TIME, '').trim();
    if (!text) continue;

    const words: LyricWord[] = [];
    if (text.includes('<')) {
      let last = 0;
      let wm: RegExpExecArray | null;
      WORD_TIME.lastIndex = 0;
      while ((wm = WORD_TIME.exec(text))) {
        const before = text.slice(last, wm.index);
        if (before.trim() && words.length > 0) {
          words[words.length - 1].text += before;
        } else if (before.trim() && words.length === 0 && times.length === 0) {
          words.push({ t: 0, text: before.trim() });
        }
        words.push({ t: stamp(wm[1], wm[2], wm[3]), text: '' });
        last = wm.index + wm[0].length;
      }
      const tail = text.slice(last);
      if (words.length) words[words.length - 1].text += tail;
      text = text.replace(WORD_TIME, '').replace(/\s+/g, ' ').trim();

      const cleaned = words
        .map((w) => ({ ...w, text: w.text.trim() }))
        .filter((w) => w.text.length > 0);
      if (cleaned.length > 1) {
        wordSync = true;
        for (const t of times.length ? times : [cleaned[0].t]) {
          lines.push({ t, text, words: cleaned });
        }
        synced = true;
        continue;
      }
    }

    if (!times.length) {
      lines.push({ t: null, text });
      continue;
    }
    synced = true;
    for (const t of times) lines.push({ t, text });
  }

  // de-duplicate exact (time, text) pairs, they show up in badly merged files
  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    const key = `${l.t ?? 'x'}|${l.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (synced) {
    const timed = unique.filter((l): l is LyricLine & { t: number } => l.t !== null);
    timed.sort((a, b) => a.t - b.t);
    const untimed = unique.filter((l) => l.t === null);
    return { lines: [...timed, ...untimed], synced: true, wordSync };
  }
  return { lines: unique, synced: false, wordSync: false };
}

/**
 * Turns lyrics typed or pasted by the user into lines. Timestamps are kept when
 * the text is LRC (or partially timed), otherwise every line is untimed.
 */
export function lyricsFromText(raw: string): {
  lines: LyricLine[];
  synced: boolean;
  wordSync: boolean;
} {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return { lines: [], synced: false, wordSync: false };
  if (/\[\d{1,3}:\d{2}/.test(text)) {
    const parsed = parseLrc(text);
    if (parsed.lines.length) return parsed;
  }
  const lines: LyricLine[] = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(ar|ti|al|by|offset|re|ve|length):/i.test(line))
    .map((line) => ({ t: null, text: line }));
  return { lines, synced: false, wordSync: false };
}

interface Rating {
  score: number;
  titleMatch: boolean;
  artistMatch: boolean;
}

function rate(result: LrcLibResult, track: SongRef): Rating {
  let s = 0;
  if (result.syncedLyrics) s += 60;
  if (result.hasWordSync) s += 8;

  const title = normalize(result.trackName);
  const wantTitle = normalize(track.title);
  const titleMatch = !!title && !!wantTitle && (title === wantTitle || title.includes(wantTitle) || wantTitle.includes(title));
  if (title === wantTitle) s += 25;
  else if (titleMatch) s += 12;

  const artist = normalize(result.artistName);
  const wantArtist = normalize(track.artist);
  const artistMatch = !!artist && !!wantArtist && (artist === wantArtist || artist.includes(wantArtist) || wantArtist.includes(artist));
  if (artist === wantArtist) s += 25;
  else if (artistMatch) s += 10;

  if (track.duration && result.duration) {
    const delta = Math.abs(result.duration - track.duration);
    if (delta <= 2) s += 30;
    else if (delta <= 5) s += 18;
    else if (delta <= 12) s += 6;
    else if (delta > 45) s -= 15;
  }
  if (track.album && result.albumName && normalize(result.albumName) === normalize(track.album)) {
    s += 10;
  }
  return { score: s, titleMatch, artistMatch };
}

/**
 * Picks the best candidate. A wrong-artist entry with synced lyrics must never
 * beat the right artist with plain lyrics (LRCLIB has plenty of misattributed
 * uploads), so matching artists always win, and unrelated titles are dropped.
 */
function bestMatch(results: LrcLibResult[], track: SongRef): LrcLibResult | null {
  const rated = results
    .map((result) => ({ result, ...rate(result, track) }))
    .filter((entry) => entry.titleMatch)
    .sort((a, b) => b.score - a.score);
  if (!rated.length) return null;
  // Showing the lyrics of another artist's song is worse than showing nothing.
  const withArtist = rated.filter((entry) => entry.artistMatch);
  if (!withArtist.length) return null;

  // Radio metadata never carries a length, so every upload of the song scores
  // the same: pick the album/radio cut, not a video edit whose timestamps are
  // shifted by a spoken intro.
  const tied = withArtist.filter((entry) => entry.score === withArtist[0].score);
  if (!track.duration && tied.length > 1) {
    const durations = tied
      .map((entry) => entry.result.duration)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    const centre = durations.length >= 3 ? median(durations) : null;
    const usable = tied
      .filter(
        (entry) =>
          !!centre && !!entry.result.duration && entry.result.duration >= centre * 0.75,
      )
      .sort((a, b) => (a.result.duration as number) - (b.result.duration as number));
    if (usable.length) return usable[0].result;
  }
  return withArtist[0].result;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${LRCLIB}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  // LRCLIB regularly answers 503 "ServerOverloaded" during peaks: retry briefly.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return (await res.json()) as unknown;
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      if (attempt === 2) return null;
    }
    await sleep(400 * (attempt + 1));
  }
  return null;
}

export async function searchLyrics(query: string): Promise<LrcLibResult[]> {
  const data = (await call('/search', { q: query })) as LrcLibResult[] | null;
  if (!Array.isArray(data)) return [];
  return data.slice(0, 20);
}

/** Finds the best lyrics match for a track, preferring time-synced entries. */
export async function findLyrics(track: SongRef): Promise<LrcLibResult | null> {
  const exact = (await call('/get', {
    artist_name: track.artist,
    track_name: track.title,
    album_name: track.album,
    duration: track.duration ? Math.round(track.duration) : undefined,
  })) as LrcLibResult | null;
  const results = (await call('/search', {
    track_name: track.title,
    artist_name: track.artist,
  })) as LrcLibResult[] | null;
  const pool = Array.isArray(results) ? [...results] : [];
  if (exact) pool.push(exact);
  if (!pool.length) {
    const loose = (await call('/search', { q: `${track.artist} ${track.title}` })) as
      | LrcLibResult[]
      | null;
    if (Array.isArray(loose)) pool.push(...loose);
  }

  // a time-synced entry from a search can beat the plain exact match
  const best = bestMatch(pool, track);
  if (best) return best;
  if (exact?.syncedLyrics || exact?.plainLyrics) return exact;
  return null;
}

export function lyricsFromResult(result: LrcLibResult | null): {
  lines: LyricLine[];
  synced: boolean;
  wordSync: boolean;
  instrumental: boolean;
} {
  if (!result) return { lines: [], synced: false, wordSync: false, instrumental: false };
  if (result.syncedLyrics) {
    const parsed = parseLrc(result.syncedLyrics);
    if (parsed.lines.length) return { ...parsed, instrumental: !!result.instrumental };
  }
  if (result.plainLyrics) {
    const lines = result.plainLyrics
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ t: null, text }));
    return { lines, synced: false, wordSync: false, instrumental: !!result.instrumental };
  }
  return { lines: [], synced: false, wordSync: false, instrumental: !!result.instrumental };
}
