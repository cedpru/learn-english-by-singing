import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { recognizeAudio } from './shazam.js';
import type { SongRef } from './types.js';

export interface StreamSync {
  status: 'matched' | 'no_match';
  track?: SongRef;
  /** position of the captured clip inside the track, in seconds */
  offset?: number;
  /** epoch ms when the capture started (the clock anchor) */
  capturedAt: number;
  clipSeconds: number;
}

/** Records `seconds` of a live stream to a wav file with the bundled ffmpeg. */
function recordStream(url: string, out: string, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      // `-re` reads at native speed: without it some CDNs burst the whole clip
      // in a fraction of a second and the offset no longer maps to wall clock.
      '-re',
      '-t',
      String(seconds),
      '-i',
      url,
      '-ar',
      '44100',
      '-ac',
      '1',
      '-f',
      'wav',
      out,
    ];
    const child = spawn(ffmpeg.path, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const killer = setTimeout(() => child.kill('SIGKILL'), (seconds + 12) * 1000);
    child.on('error', (err) => {
      clearTimeout(killer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(killer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Listens to the stream itself for a few seconds and asks Shazam where the song
 * is. This is the only way to know the real position when the listener joins
 * in the middle of a track (ICY metadata only tells us *which* track it is).
 */
export async function syncFromStream(url: string, seconds = 8): Promise<StreamSync> {
  const dir = await mkdtemp(path.join(tmpdir(), 'singalong-radio-'));
  const file = path.join(dir, 'clip.wav');
  const capturedAt = Date.now();
  try {
    await recordStream(url, file, seconds);
    const info = await stat(file).catch(() => null);
    if (!info || info.size < 20_000) {
      return { status: 'no_match', capturedAt, clipSeconds: seconds };
    }
    const buffer = await readFile(file);
    const result = await recognizeAudio(buffer);
    if (!result) return { status: 'no_match', capturedAt, clipSeconds: seconds };
    return {
      status: 'matched',
      track: result.track,
      offset: result.matchOffset ?? 0,
      capturedAt,
      clipSeconds: seconds,
    };
  } catch (err) {
    console.warn('[radio-sync]', (err as Error).message);
    return { status: 'no_match', capturedAt, clipSeconds: seconds };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
