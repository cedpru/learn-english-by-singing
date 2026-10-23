import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';
import {
  KaraokePayloadDto,
  LyricLineDto,
  LyricWordDto,
  SongRefDto,
  SourceLang,
  TranslationStatus,
} from '../common/types';
import { TranslationService } from './translation.service';

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'SingAlong/1.0 (personal karaoke assistant)';
const REMOTE_TIMEOUT_MS = 12_000;
const DAY_MS = 86_400_000;

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

export interface SearchEntry {
  id: number;
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  synced: boolean;
  instrumental: boolean;
}

export interface ParsedLyrics {
  lines: LyricLineDto[];
  synced: boolean;
  wordSync: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class LyricsService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly translation: TranslationService,
  ) {}

  normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\((feat|ft|with)[^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private async callLrclib<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T | null> {
    const url = new URL(`${LRCLIB}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    // LRCLIB regularly answers 503 "ServerOverloaded" during peaks: retry briefly.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await firstValueFrom(
          this.httpService.get<T>(url.toString(), {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            timeout: REMOTE_TIMEOUT_MS,
            validateStatus: () => true,
          }),
        );
        if (response.status >= 200 && response.status < 300) return response.data;
        if (response.status < 500 && response.status !== 429) return null;
      } catch {
        if (attempt === 2) return null;
      }
      await sleep(400 * (attempt + 1));
    }
    return null;
  }

  async searchLyrics(query: string): Promise<SearchEntry[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const cacheKey = `lyrics:search:${trimmed.toLowerCase()}`;
    const cached = await this.cacheManager.get<SearchEntry[]>(cacheKey);
    if (cached !== undefined) return cached;

    const data = await this.callLrclib<LrcLibResult[]>('/search', { q: trimmed });
    if (!Array.isArray(data)) return [];

    const results = this.uniqueResults(data.slice(0, 20));
    await this.cacheManager.set(cacheKey, results, DAY_MS);
    return results;
  }

  async findLyrics(track: SongRefDto): Promise<LrcLibResult | null> {
    const cacheKey = `lyrics:find:${this.normalize(track.artist)}|${this.normalize(track.title)}|${this.normalize(
      track.album ?? '',
    )}`;
    const cached = await this.cacheManager.get<LrcLibResult | null>(cacheKey);
    if (cached !== undefined) return cached;

    const exact = await this.callLrclib<LrcLibResult>('/get', {
      artist_name: track.artist,
      track_name: track.title,
      album_name: track.album,
      duration: track.duration ? Math.round(track.duration) : undefined,
    });

    const searchResults = await this.callLrclib<LrcLibResult[]>('/search', {
      track_name: track.title,
      artist_name: track.artist,
    });

    const pool: LrcLibResult[] = Array.isArray(searchResults) ? [...searchResults] : [];
    if (exact) pool.push(exact);

    if (!pool.length) {
      const loose = await this.callLrclib<LrcLibResult[]>('/search', {
        q: `${track.artist} ${track.title}`,
      });
      if (Array.isArray(loose)) pool.push(...loose);
    }

    const best = pool.length ? this.bestMatch(pool, track) : null;
    const result = best ?? (exact?.syncedLyrics || exact?.plainLyrics ? exact : null);

    await this.cacheManager.set(cacheKey, result, DAY_MS);
    return result;
  }

  /** Collapses the many uploads of one song into a single search result. */
  uniqueResults(results: LrcLibResult[]): SearchEntry[] {
    interface Candidate {
      entry: SearchEntry;
      hasLyrics: boolean;
      wordSync: boolean;
      order: number;
    }

    const groups = new Map<string, Candidate[]>();

    results.forEach((result, order) => {
      const title = this.cleanTitle(result.artistName, result.trackName);
      const artistKey =
        this.normalize(
          result.artistName.replace(/\s*[-–—]\s*(topic|vevo|official).*$/i, '').replace(/\([^)]*\)/g, ''),
        ) || this.normalize(result.artistName);
      const key = `${this.normalize(title)}|${artistKey}`;
      if (!this.normalize(title)) return;

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
      // Video edits run ~20% longer than the album cut and their timestamps are
      // shifted: stay near the typical length and prefer the shortest cut.
      const centre = durations.length >= 3 ? this.median(durations) : null;
      const usable = (c: Candidate) =>
        !!centre && !!c.entry.duration && c.entry.duration >= centre * 0.75;

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

  /**
   * Strips "Artist - ", "(Official Video)", "[Site][01 Title]" and similar noise
   * from uploaded titles: LRCLIB is a community database, the same song is often
   * uploaded as "Roar", "06 Katy Perry - Roar" and "[Katy Perry][01 Roar][mirror.com]".
   */
  cleanTitle(artist: string, title: string): string {
    let clean = title.replace(/\s+/g, ' ').trim();

    if (/^(?:\[[^\]]{1,60}\]\s*)+$/.test(clean)) {
      const groups = [...clean.matchAll(/\[([^\]]{1,60})\]/g)]
        .map((match) => match[1].trim())
        .filter(Boolean);
      const keep = groups.find(
        (group) =>
          this.normalize(group) !== this.normalize(artist) &&
          !this.normalize(group).includes(this.normalize(artist)) &&
          !/^https?:/i.test(group) &&
          !/^[\w-]+\.[a-z]{2,4}$/i.test(group) &&
          /[a-z]{2,}/i.test(group),
      );
      if (keep) clean = keep;
    }

    clean = clean.replace(/^(?:\[[^\]]{1,40}\]\s*)+/, '').trim();
    clean = clean
      .replace(
        /[(\[][^)\]]*(official|lyrics?|audio|video|visuali[sz]er|remaster\w*|hq|hd|mv|clip|paroles|letra|colou?r coded)[^)\]]*[)\]]/gi,
        '',
      )
      .trim();

    const norm = (value: string) => this.normalize(value).replace(/\s+/g, '');
    clean = clean
      .replace(/^\d{1,3}\s*[.)\-–—]\s*(?=\S)/, '')
      .replace(/^0\d{1,2}\s+(?=\S{2,})/, '')
      .trim();

    for (let i = 0; i < 2; i += 1) {
      const match = /^(.{2,80}?)\s*[-–—]\s*(.+)$/.exec(clean);
      if (!match) break;
      const prefix = norm(match[1]).replace(/^\d{1,3}/, '');
      const rest = match[2].trim();
      if (prefix === norm(artist) || (prefix.length > 2 && norm(artist).includes(prefix))) {
        clean = rest;
      } else break;
    }

    const artistWords = this.normalize(artist).split(' ').filter(Boolean);
    const words = clean.split(' ');
    if (artistWords.length && words.length > artistWords.length) {
      const tail = this.normalize(words.slice(-artistWords.length).join(' '));
      if (tail === artistWords.join(' ')) {
        clean = words.slice(0, -artistWords.length).join(' ').trim();
      }
    }

    return clean.replace(/[\s\-–—]+$/, '').trim() || title.trim();
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private rate(
    result: LrcLibResult,
    track: SongRefDto,
  ): { score: number; titleMatch: boolean; artistMatch: boolean } {
    let score = 0;
    if (result.syncedLyrics) score += 60;
    if (result.hasWordSync) score += 8;

    const title = this.normalize(result.trackName);
    const wantTitle = this.normalize(track.title);
    const titleMatch =
      !!title &&
      !!wantTitle &&
      (title === wantTitle || title.includes(wantTitle) || wantTitle.includes(title));
    if (title === wantTitle) score += 25;
    else if (titleMatch) score += 12;

    const artist = this.normalize(result.artistName);
    const wantArtist = this.normalize(track.artist);
    const artistMatch =
      !!artist &&
      !!wantArtist &&
      (artist === wantArtist || artist.includes(wantArtist) || wantArtist.includes(artist));
    if (artist === wantArtist) score += 25;
    else if (artistMatch) score += 10;

    if (track.duration && result.duration) {
      const delta = Math.abs(result.duration - track.duration);
      if (delta <= 2) score += 30;
      else if (delta <= 5) score += 18;
      else if (delta <= 12) score += 6;
      else if (delta > 45) score -= 15;
    }
    if (track.album && result.albumName && this.normalize(result.albumName) === this.normalize(track.album)) {
      score += 10;
    }

    return { score, titleMatch, artistMatch };
  }

  /**
   * Picks the best candidate. A wrong-artist entry with synced lyrics must never
   * beat the right artist with plain lyrics: showing another song's lyrics is
   * worse than showing nothing.
   */
  private bestMatch(results: LrcLibResult[], track: SongRefDto): LrcLibResult | null {
    const rated = results
      .map((result) => ({ result, ...this.rate(result, track) }))
      .filter((entry) => entry.titleMatch)
      .sort((a, b) => b.score - a.score);
    if (!rated.length) return null;

    const withArtist = rated.filter((entry) => entry.artistMatch);
    if (!withArtist.length) return null;

    // Radio metadata never carries a length, so every upload scores the same:
    // pick the album/radio cut, not a video edit shifted by a spoken intro.
    const tied = withArtist.filter((entry) => entry.score === withArtist[0].score);
    if (!track.duration && tied.length > 1) {
      const durations = tied
        .map((entry) => entry.result.duration)
        .filter((duration): duration is number => typeof duration === 'number' && duration > 0);
      const centre = durations.length >= 3 ? this.median(durations) : null;
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

  private stamp(min: string, sec: string, frac?: string): number {
    const f = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) / 1000 : 0;
    return Number(min) * 60 + Number(sec) + f;
  }

  /**
   * Parses plain LRC as well as "enhanced" LRC (word-level `<mm:ss.xx>` markers).
   * Lines without timestamps are kept with `t: null` so the UI can still show them.
   */
  parseLrc(raw: string): ParsedLyrics {
    const lines: LyricLineDto[] = [];
    let synced = false;
    let wordSync = false;

    const LEADING_TIME = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/;
    const WORD_TIME = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;

    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || /^\[(ar|ti|al|by|offset|re|ve|length):/i.test(line)) continue;

      // A line may carry several timestamps (`[00:10.00][00:20.00]Chorus`): all
      // of them are at the start, the text comes after.
      const times: number[] = [];
      let rest = line;
      let leading: RegExpExecArray | null;
      while ((leading = LEADING_TIME.exec(rest))) {
        times.push(this.stamp(leading[1], leading[2], leading[3]));
        rest = rest.slice(leading[0].length);
      }

      // Timestamps in the middle of a line are not anchors: drop them from the text.
      let text = rest.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
      if (!text) continue;

      const words: LyricWordDto[] = [];
      if (text.includes('<')) {
        let last = 0;
        let wordMatch: RegExpExecArray | null;
        WORD_TIME.lastIndex = 0;
        while ((wordMatch = WORD_TIME.exec(text))) {
          const before = text.slice(last, wordMatch.index);
          if (before.trim() && words.length > 0) {
            words[words.length - 1].text += before;
          } else if (before.trim() && words.length === 0 && times.length === 0) {
            words.push({ t: 0, text: before.trim() });
          }
          words.push({ t: this.stamp(wordMatch[1], wordMatch[2], wordMatch[3]), text: '' });
          last = wordMatch.index + wordMatch[0].length;
        }
        const tail = text.slice(last);
        if (words.length) words[words.length - 1].text += tail;
        text = text.replace(WORD_TIME, '').replace(/\s+/g, ' ').trim();

        const cleaned = words
          .map((word) => ({ ...word, text: word.text.trim() }))
          .filter((word) => word.text.length > 0);
        if (cleaned.length > 1) {
          wordSync = true;
          for (const time of times.length ? times : [cleaned[0].t]) {
            lines.push({ t: time, text, words: cleaned });
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
      for (const time of times) lines.push({ t: time, text });
    }

    const seen = new Set<string>();
    const unique = lines.filter((line) => {
      const key = `${line.t ?? 'x'}|${line.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (synced) {
      const timed = unique.filter(
        (line): line is LyricLineDto & { t: number } => line.t !== null && line.t !== undefined,
      );
      timed.sort((a, b) => a.t - b.t);
      const untimed = unique.filter((line) => line.t === null || line.t === undefined);
      return { lines: [...timed, ...untimed], synced: true, wordSync };
    }

    return { lines: unique, synced: false, wordSync: false };
  }

  /** Turns lyrics typed or pasted by the user into lines, keeping LRC timestamps. */
  lyricsFromText(raw: string): ParsedLyrics {
    const text = raw.replace(/\r\n?/g, '\n').trim();
    if (!text) return { lines: [], synced: false, wordSync: false };

    if (/\[\d{1,3}:\d{2}/.test(text)) {
      const parsed = this.parseLrc(text);
      if (parsed.lines.length) return parsed;
    }

    const lines: LyricLineDto[] = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^\[(ar|ti|al|by|offset|re|ve|length):/i.test(line))
      .map((line) => ({ t: null, text: line }));

    return { lines, synced: false, wordSync: false };
  }

  lyricsFromResult(result: LrcLibResult | null): ParsedLyrics & { instrumental: boolean } {
    if (!result) return { lines: [], synced: false, wordSync: false, instrumental: false };

    if (result.syncedLyrics) {
      const parsed = this.parseLrc(result.syncedLyrics);
      if (parsed.lines.length) return { ...parsed, instrumental: !!result.instrumental };
    }

    if (result.plainLyrics) {
      const lines = result.plainLyrics
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({ t: null, text }));
      return { lines, synced: false, wordSync: false, instrumental: !!result.instrumental };
    }

    return { lines: [], synced: false, wordSync: false, instrumental: !!result.instrumental };
  }

  /**
   * Builds the payload the karaoke screen consumes: lines, sync flags, language
   * and the French translation. Non-Latin scripts get no translation at all.
   */
  async getKaraokePayload(
    track: SongRefDto,
    rawLyrics: string | undefined,
    lines: LyricLineDto[],
    synced: boolean,
    wordSync: boolean,
    instrumental: boolean,
    provider: string,
  ): Promise<KaraokePayloadDto> {
    const text = lines.map((line) => line.text).join('\n');
    const sourceLang = this.translation.detectLanguage(text);
    let translation: TranslationStatus;

    if (!lines.length || instrumental) {
      translation = TranslationStatus.EMPTY;
    } else if (!this.translation.isLatinScript(text)) {
      translation = TranslationStatus.UNSUPPORTED;
    } else if (sourceLang === SourceLang.FR) {
      translation = TranslationStatus.ALREADY_TARGET;
    } else {
      translation = sourceLang === SourceLang.OTHER
        ? TranslationStatus.APPROXIMATE
        : TranslationStatus.OK;
      const translated = await this.translation.translateLines(lines);
      lines.forEach((line, index) => {
        if (translated[index]) line.fr = translated[index];
      });
    }

    return {
      track,
      lines,
      synced,
      wordSync,
      instrumental,
      sourceLang,
      translation,
      provider,
    };
  }
}
