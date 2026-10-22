import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { Shazam } from 'node-shazam';
import type { SongRef } from './types.js';

const shazam = new Shazam();

export interface Recognition {
  track: SongRef & { cover?: string; duration?: number };
  matchOffset?: number;
  raw?: unknown;
}

/** Shazam (unofficial endpoint) rate-limits bursts, so calls are serialised. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

interface ShazamTrack {
  title?: string;
  subtitle?: string;
  isrc?: string;
  images?: { coverarthq?: string; coverart?: string };
  sections?: { metadata?: { title?: string; text?: string }[] }[];
}

function meta(track: ShazamTrack, label: string): string | undefined {
  const sections = track.sections ?? [];
  for (const section of sections) {
    for (const item of section.metadata ?? []) {
      if (item.title?.toLowerCase() === label) return item.text;
    }
  }
  return undefined;
}

/**
 * Shazam only reads raw WAV. Browsers record webm/opus (or mp4 on Safari), and
 * the radio capture is already a wav: decode everything to 44.1 kHz mono first.
 */
function toWav(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg.path,
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-ar', '44100', '-ac', '1', '-f', 'wav', output],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Recognises a track from an audio clip (any format ffmpeg can decode).
 * Returns the position of the clip inside the song so the lyrics can be synced.
 */
export async function recognizeAudio(buffer: Buffer): Promise<Recognition | null> {
  const dir = await mkdtemp(path.join(tmpdir(), 'singalong-'));
  const file = path.join(dir, 'clip');
  const wav = path.join(dir, 'clip.wav');
  try {
    await writeFile(file, buffer);
    await toWav(file, wav);
    // a few bytes of silence: no point asking Shazam
    const info = await stat(wav).catch(() => null);
    if (!info || info.size < 20_000) return null;
    return await serial(async () => {
      const result = (await shazam.recognise(wav, 'en-US', false)) as
        | {
            matches?: { offset?: number }[];
            track?: ShazamTrack;
          }
        | null;
      const track = result?.track;
      const title = track?.title;
      if (!track || !title) return null;
      const duration = Number(meta(track, 'duration') ?? 0) || undefined;
      return {
        track: {
          title,
          artist: track.subtitle ?? 'Artiste inconnu',
          album: meta(track, 'album'),
          cover: track.images?.coverarthq ?? track.images?.coverart,
          isrc: track.isrc,
          duration,
        },
        matchOffset: result.matches?.[0]?.offset,
      } satisfies Recognition;
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
