import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { getRadio, listRadios, startRadio, stopRadio } from './icy.js';
import { findLyrics, lyricsFromResult, lyricsFromText, searchLyrics, uniqueResults } from './lyrics.js';
import { PRESETS } from './presets.js';
import { syncFromStream, type StreamSync } from './radio-sync.js';
import { recognizeAudio } from './shazam.js';
import { detectLanguage, isLatinScript, translateLines } from './translate.js';
import type { KaraokePayload, LyricLine, SongRef } from './types.js';

const configuredPort = Number(process.env.PORT);
const PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 8787;
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, radios: listRadios().length });
});

app.get('/api/presets', (_req, res) => {
  res.json(PRESETS);
});

/** Recognises an audio clip sent by the microphone. */
app.post(
  '/api/recognize',
  express.raw({ type: () => true, limit: '30mb' }),
  async (req, res) => {
    const body = req.body as Buffer;
    if (!body || !body.length) {
      res.status(400).json({ error: 'clip audio vide' });
      return;
    }
    try {
      const result = await recognizeAudio(body);
      if (!result) {
        res.json({ status: 'no_match' });
        return;
      }
      res.json({
        status: 'matched',
        track: { ...result.track, offset: result.matchOffset ?? 0 },
      });
    } catch (err) {
      console.error('[recognize]', err);
      // node-shazam sometimes rejects with a bare Error, whose message is empty
      const reason = (err as Error).message || 'extrait audio illisible';
      res.status(502).json({ error: `reconnaissance impossible : ${reason}` });
    }
  },
);

/** Builds the karaoke payload: synced lyrics + french translation. */
app.post('/api/karaoke', async (req, res) => {
  const track = req.body?.track as SongRef | undefined;
  if (!track?.artist || !track?.title) {
    res.status(400).json({ error: 'artist et title sont requis' });
    return;
  }
  const rawLyrics =
    typeof req.body?.rawLyrics === 'string' ? req.body.rawLyrics.slice(0, 40_000) : '';
  try {
    // Lyrics typed or pasted by the user replace the (sometimes missing) online entry.
    const manual = rawLyrics.trim() ? lyricsFromText(rawLyrics) : null;
    const result = manual ? null : await findLyrics(track);
    const { lines, synced, wordSync, instrumental } = manual
      ? { ...manual, instrumental: false }
      : lyricsFromResult(result);
    const resolved: SongRef = {
      ...track,
      album: track.album ?? result?.albumName,
      duration: track.duration ?? result?.duration ?? undefined,
      cover: track.cover,
    };
    const text = lines.map((l) => l.text).join('\n');
    const sourceLang = detectLanguage(text);

    let translation: KaraokePayload['translation'] = 'empty';
    if (!lines.length || instrumental) {
      translation = 'empty';
    } else if (!isLatinScript(text)) {
      translation = 'unsupported';
    } else if (sourceLang === 'fr') {
      translation = 'already-target';
    } else {
      translation = sourceLang === 'other' ? 'approximate' : 'ok';
      const out = await translateLines(lines);
      lines.forEach((line: LyricLine, i: number) => {
        line.fr = out[i] || undefined;
      });
    }

    const payload: KaraokePayload = {
      track: resolved,
      lines,
      synced,
      wordSync,
      instrumental,
      sourceLang,
      translation,
      provider: manual ? 'manuel' : result ? 'LRCLIB' : 'aucun',
    };
    res.json(payload);
  } catch (err) {
    console.error('[karaoke]', err);
    res.status(502).json({ error: `paroles indisponibles : ${(err as Error).message}` });
  }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  try {
    const results = await searchLyrics(q);
    // LRCLIB often has several uploads of the same song: one line per track
    res.json(uniqueResults(results));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post('/api/radio', (req, res) => {
  const url = String(req.body?.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'URL de flux invalide' });
    return;
  }
  const name = String(req.body?.name ?? 'Flux personnalisé');
  const session = startRadio(url, name);
  res.json(session);
});

/** Captures the live stream and asks Shazam for the exact song position. */
const syncJobs = new Map<string, Promise<StreamSync>>();

app.post('/api/radio/:id/sync', async (req, res) => {
  const session = getRadio(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'session inconnue' });
    return;
  }
  if (session.status !== 'live') {
    res.status(409).json({ error: 'ce flux ne publie pas de métadonnées' });
    return;
  }
  const key = `${session.id}|${session.title ?? ''}`;
  let job = syncJobs.get(key);
  if (!job) {
    job = syncFromStream(session.url);
    syncJobs.set(key, job);
    void job.finally(() => setTimeout(() => syncJobs.delete(key), 30_000));
  }
  res.json(await job);
});

app.get('/api/radio/:id', (req, res) => {
  const session = getRadio(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'session inconnue' });
    return;
  }
  res.json(session);
});

app.delete('/api/radio/:id', (req, res) => {
  res.json({ ok: stopRadio(req.params.id) });
});

const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`♪ API prête sur http://127.0.0.1:${PORT}`);
});

/**
 * The desktop app starts this server as a child process. If the window is
 * closed (or crashes), nothing would stop node on Windows: watch the parent and
 * quit as soon as it is gone, so the port is never left busy.
 */
const parentPid = Number(process.env.SINGALONG_PARENT_PID);
if (Number.isFinite(parentPid) && parentPid > 0) {
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 2000);
  watchdog.unref?.();
}
