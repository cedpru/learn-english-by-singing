import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { of } from 'rxjs';
import { SourceLang, TranslationStatus } from '../../common/types';
import { LyricsService } from '../lyrics.service';
import { TranslationService } from '../translation.service';

function makeService(httpGet?: jest.Mock) {
  const http = { get: httpGet ?? jest.fn() } as unknown as HttpService;
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  } as unknown as Cache;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const translation = new TranslationService(config);
  return { service: new LyricsService(http, cache, translation), translation };
}

describe('LyricsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseLrc', () => {
    it('parses plain LRC timestamps', () => {
      const { service } = makeService();
      const parsed = service.parseLrc('[ar:Katy Perry]\n[00:12.34]Hello\n[00:15.00]World');

      expect(parsed.synced).toBe(true);
      expect(parsed.wordSync).toBe(false);
      expect(parsed.lines.map((line) => [line.t, line.text])).toEqual([
        [12.34, 'Hello'],
        [15, 'World'],
      ]);
    });

    it('keeps untimed lines and marks them as unsynced', () => {
      const { service } = makeService();
      const parsed = service.parseLrc('just some words\nno timings here');

      expect(parsed.synced).toBe(false);
      expect(parsed.lines).toEqual([
        { t: null, text: 'just some words' },
        { t: null, text: 'no timings here' },
      ]);
    });

    it('parses enhanced LRC word timings', () => {
      const { service } = makeService();
      const parsed = service.parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world');

      expect(parsed.synced).toBe(true);
      expect(parsed.wordSync).toBe(true);
      expect(parsed.lines[0].text).toBe('Hello world');
      expect(parsed.lines[0].words).toEqual([
        { t: 1, text: 'Hello' },
        { t: 1.5, text: 'world' },
      ]);
    });

    it('expands lines that carry several timestamps', () => {
      const { service } = makeService();
      const parsed = service.parseLrc('[00:10.00][00:20.00]Chorus');

      expect(parsed.lines.map((line) => line.t)).toEqual([10, 20]);
      expect(parsed.lines.every((line) => line.text === 'Chorus')).toBe(true);
    });
  });

  describe('lyricsFromText', () => {
    it('splits pasted text into untimed lines', () => {
      const { service } = makeService();
      const parsed = service.lyricsFromText('line one\n\nline two\n');

      expect(parsed.synced).toBe(false);
      expect(parsed.lines).toEqual([
        { t: null, text: 'line one' },
        { t: null, text: 'line two' },
      ]);
    });

    it('keeps LRC timings when the pasted text is LRC', () => {
      const { service } = makeService();
      const parsed = service.lyricsFromText('[00:05.00]Hello');

      expect(parsed.synced).toBe(true);
      expect(parsed.lines[0].t).toBe(5);
    });
  });

  describe('cleanTitle', () => {
    const { service } = makeService();

    it('removes the artist and the track number an uploader added', () => {
      expect(service.cleanTitle('Katy Perry', '06 Katy Perry - Roar')).toBe('Roar');
    });

    it('removes "(Official Video)" style suffixes', () => {
      expect(service.cleanTitle('Katy Perry', 'Roar (Official Video)')).toBe('Roar');
    });

    it('keeps the real title when the whole title is a tag list', () => {
      expect(service.cleanTitle('Katy Perry', '[Katy Perry][01 Roar][i-funbox.com]')).toBe('Roar');
    });
  });

  describe('uniqueResults', () => {
    it('collapses uploads of one song, keeping the synced copy', () => {
      const { service } = makeService();
      const entries = service.uniqueResults([
        {
          id: 1,
          trackName: 'Roar',
          artistName: 'Katy Perry',
          duration: 223,
          plainLyrics: 'text',
          syncedLyrics: null,
        },
        {
          id: 2,
          trackName: 'Katy Perry - Roar',
          artistName: 'Katy Perry - Topic',
          duration: 224,
          plainLyrics: null,
          syncedLyrics: '[00:01.00]text',
        },
      ]);

      expect(entries).toHaveLength(1);
      expect(entries[0].synced).toBe(true);
    });
  });

  describe('findLyrics', () => {
    it('prefers the right artist with plain lyrics over another artist with synced lyrics', async () => {
      const httpGet = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/get')) return of({ status: 404, data: null });
        return of({
          status: 200,
          data: [
            {
              id: 1,
              trackName: 'Roar',
              artistName: 'Someone Else',
              syncedLyrics: '[00:01.00]wrong song',
              plainLyrics: null,
            },
            {
              id: 2,
              trackName: 'Roar',
              artistName: 'Katy Perry',
              syncedLyrics: null,
              plainLyrics: 'right song',
            },
          ],
        });
      });

      const { service } = makeService(httpGet);
      const result = await service.findLyrics({ artist: 'Katy Perry', title: 'Roar' });

      expect(result?.id).toBe(2);
    });

    it('returns null when only another artist matches', async () => {
      const httpGet = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/get')) return of({ status: 404, data: null });
        return of({
          status: 200,
          data: [
            {
              id: 3,
              trackName: 'Roar',
              artistName: 'Someone Else',
              syncedLyrics: '[00:01.00]wrong song',
            },
          ],
        });
      });

      const { service } = makeService(httpGet);
      await expect(service.findLyrics({ artist: 'Katy Perry', title: 'Roar' })).resolves.toBeNull();
    });
  });

  describe('language detection', () => {
    const { translation } = makeService();

    it('tells English from French', () => {
      expect(translation.detectLanguage('the night we met and you were there')).toBe(SourceLang.EN);
      expect(translation.detectLanguage("je t'aime et tu me manques")).toBe(SourceLang.FR);
    });

    it('flags non-Latin scripts', () => {
      expect(translation.detectLanguage('사랑해')).toBe(SourceLang.OTHER);
      expect(translation.isLatinScript('사랑해')).toBe(false);
      expect(translation.isLatinScript('hello')).toBe(true);
    });
  });

  describe('getKaraokePayload', () => {
    it('translates English lines', async () => {
      const { service, translation } = makeService();
      const spy = jest.spyOn(translation, 'translateLines').mockResolvedValue(['Bonjour']);

      const payload = await service.getKaraokePayload(
        { artist: 'A', title: 'T' },
        undefined,
        [{ t: 0, text: 'Hello you and me' }],
        true,
        false,
        false,
        'LRCLIB',
      );

      expect(spy).toHaveBeenCalledTimes(1);
      expect(payload.translation).toBe(TranslationStatus.OK);
      expect(payload.sourceLang).toBe(SourceLang.EN);
      expect(payload.lines[0].fr).toBe('Bonjour');
      expect(payload.provider).toBe('LRCLIB');
    });

    it('does not translate French songs', async () => {
      const { service, translation } = makeService();
      const spy = jest.spyOn(translation, 'translateLines');

      const payload = await service.getKaraokePayload(
        { artist: 'A', title: 'T' },
        undefined,
        [{ t: null, text: "je t'aime et tu me manques" }],
        false,
        false,
        false,
        'LRCLIB',
      );

      expect(payload.translation).toBe(TranslationStatus.ALREADY_TARGET);
      expect(spy).not.toHaveBeenCalled();
    });

    it('refuses to translate non-Latin scripts', async () => {
      const { service, translation } = makeService();
      const spy = jest.spyOn(translation, 'translateLines');

      const payload = await service.getKaraokePayload(
        { artist: 'A', title: 'T' },
        undefined,
        [{ t: null, text: '사랑해' }],
        false,
        false,
        false,
        'LRCLIB',
      );

      expect(payload.translation).toBe(TranslationStatus.UNSUPPORTED);
      expect(spy).not.toHaveBeenCalled();
    });

    it('reports an empty translation for instrumental tracks', async () => {
      const { service } = makeService();
      const payload = await service.getKaraokePayload(
        { artist: 'A', title: 'T' },
        undefined,
        [],
        false,
        false,
        true,
        'LRCLIB',
      );

      expect(payload.translation).toBe(TranslationStatus.EMPTY);
    });
  });
});
