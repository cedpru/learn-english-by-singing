import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TranslationService } from '../src/lyrics/translation.service';

const LRCLIB_RESULTS = [
  {
    id: 1,
    trackName: 'Roar',
    artistName: 'Katy Perry',
    albumName: 'Prism',
    duration: 223,
    plainLyrics: null,
    syncedLyrics: '[00:01.00]I used to bite my tongue and hold my breath\n[00:05.00]Scared to rock the boat',
  },
  {
    id: 2,
    trackName: 'Queen',
    artistName: 'Another Artist',
    duration: 190,
    plainLyrics: 'some lyrics',
    syncedLyrics: null,
  },
];

describe('Sing Along API (e2e)', () => {
  let app: INestApplication;
  let translateLines: jest.Mock;

  beforeAll(async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const realTranslation = new TranslationService(config);
    translateLines = jest.fn(async (lines: { text: string }[]) => lines.map(() => 'traduction'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue({
        get: jest.fn((url: string) => {
          if (url.includes('/get')) return of({ status: 404, data: null });
          return of({ status: 200, data: LRCLIB_RESULTS });
        }),
      })
      .overrideProvider(TranslationService)
      .useValue({
        detectLanguage: (text: string) => realTranslation.detectLanguage(text),
        isLatinScript: (text: string) => realTranslation.isLatinScript(text),
        translateLines,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    // Same prefix/validation/filter setup as main.ts, so routes are tested as served.
    configureApp(app, { apiPrefix: 'api', corsOrigin: '*' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /api/health', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('radio', () => {
    it('GET /api/radio/presets returns stations', async () => {
      const response = await request(app.getHttpServer()).get('/api/radio/presets').expect(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('url');
    });

    it('POST /api/radio rejects an invalid URL', async () => {
      await request(app.getHttpServer())
        .post('/api/radio')
        .send({ url: 'not-a-url', name: 'Test Radio' })
        .expect(400);
    });

    it('creates, reads and stops a session', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/radio')
        .send({ url: 'http://127.0.0.1:9/stream', name: 'Test Radio' })
        .expect(201);

      expect(created.body).toHaveProperty('id');
      expect(created.body.name).toBe('Test Radio');

      const id = created.body.id;
      const fetched = await request(app.getHttpServer()).get(`/api/radio/${id}`).expect(200);
      expect(fetched.body.id).toBe(id);

      await request(app.getHttpServer()).get(`/api/radio/${id}/sync`).expect(404);

      const stopped = await request(app.getHttpServer()).delete(`/api/radio/${id}`).expect(200);
      expect(stopped.body.ok).toBe(true);

      await request(app.getHttpServer()).get(`/api/radio/${id}`).expect(404);
    });
  });

  describe('lyrics', () => {
    it('GET /api/lyrics/search returns deduplicated results', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/lyrics/search?q=katy')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('synced');
    });

    it('GET /api/lyrics/search returns [] for a too-short query', async () => {
      const response = await request(app.getHttpServer()).get('/api/lyrics/search?q=a').expect(200);
      expect(response.body).toEqual([]);
    });

    it('POST /api/lyrics/karaoke builds the payload from LRCLIB', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/lyrics/karaoke')
        .send({ track: { artist: 'Katy Perry', title: 'Roar' } })
        .expect(201);

      expect(response.body.provider).toBe('LRCLIB');
      expect(response.body.synced).toBe(true);
      expect(response.body.translation).toBe('ok');
      expect(response.body.lines).toHaveLength(2);
      expect(response.body.lines[0].fr).toBe('traduction');
    });

    it('POST /api/lyrics/karaoke uses pasted lyrics and never translates French', async () => {
      translateLines.mockClear();

      const response = await request(app.getHttpServer())
        .post('/api/lyrics/karaoke')
        .send({
          track: { artist: 'A', title: 'T' },
          rawLyrics: "je t'aime et tu me manques",
        })
        .expect(201);

      expect(response.body.provider).toBe('manuel');
      expect(response.body.translation).toBe('already-target');
      expect(translateLines).not.toHaveBeenCalled();
    });

    it('POST /api/lyrics/karaoke rejects a track without artist', async () => {
      await request(app.getHttpServer())
        .post('/api/lyrics/karaoke')
        .send({ track: { title: 'Roar' } })
        .expect(400);
    });
  });

  describe('recognition', () => {
    it('POST /api/recognize rejects an empty clip', async () => {
      await request(app.getHttpServer()).post('/api/recognize').send(Buffer.alloc(0)).expect(400);
    });

    it('rate-limits recognition after 10 requests per minute', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/recognize')
          .send(Buffer.alloc(0));
        statuses.push(response.status);
      }

      expect(statuses[statuses.length - 1]).toBe(429);
      expect(statuses.filter((status) => status === 429).length).toBe(1);
    });
  });
});
