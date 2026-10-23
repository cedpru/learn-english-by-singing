import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { Shazam } from 'node-shazam';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AudioProcessingException,
  ExternalApiException,
} from '../common/exceptions/custom-exceptions';
import { RecognitionResultDto, RecognitionStatus } from '../common/types';

interface ShazamTrack {
  title?: string;
  subtitle?: string;
  isrc?: string;
  images?: { coverarthq?: string; coverart?: string };
  sections?: { metadata?: { title?: string; text?: string }[] }[];
}

interface ShazamResponse {
  matches?: { offset?: number }[];
  track?: ShazamTrack;
}

const MIN_CLIP_BYTES = 20_000;

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);
  private readonly shazam = new Shazam();
  /** Shazam rate-limits bursts: calls are serialised, never parallel. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly configService: ConfigService) {}

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private ffmpegPath(): string {
    return this.configService.get<string>('FFMPEG_PATH') || ffmpeg.path;
  }

  /** Shazam only reads WAV: decode everything (webm, opus, mp3, wav) first. */
  private toWav(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.ffmpegPath(),
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          input,
          '-ar',
          '44100',
          '-ac',
          '1',
          '-f',
          'wav',
          output,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
      );

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg exit ${code}`));
      });
    });
  }

  private meta(track: ShazamTrack, label: string): string | undefined {
    for (const section of track.sections ?? []) {
      for (const item of section.metadata ?? []) {
        if (item.title?.toLowerCase() === label) return item.text;
      }
    }
    return undefined;
  }

  /**
   * Recognises a track from an audio clip and returns the clip position inside
   * the song, so the lyrics can start where the listener actually is.
   */
  async recognizeAudio(buffer: Buffer): Promise<RecognitionResultDto | null> {
    if (!buffer?.length) return null;

    const dir = await mkdtemp(path.join(tmpdir(), 'singalong-'));
    const file = path.join(dir, 'clip');
    const wav = path.join(dir, 'clip.wav');

    try {
      await writeFile(file, buffer);

      try {
        await this.toWav(file, wav);
      } catch (error) {
        throw new AudioProcessingException(
          (error as Error).message || 'décodage audio impossible',
          'AUDIO_DECODING_FAILED',
        );
      }

      const info = await stat(wav).catch(() => null);
      // A few bytes of silence: no point asking Shazam.
      if (!info || info.size < MIN_CLIP_BYTES) return null;

      return await this.serial(async () => {
        let result: ShazamResponse | null;
        try {
          result = (await this.shazam.recognise(wav, 'en-US', false)) as ShazamResponse | null;
        } catch (error) {
          // node-shazam sometimes rejects with a bare Error whose message is empty.
          throw new ExternalApiException(
            (error as Error).message || 'extrait audio illisible',
            502,
            'SHAZAM_ERROR',
          );
        }

        const track = result?.track;
        if (!track?.title) return null;

        const duration = Number(this.meta(track, 'duration') ?? 0) || undefined;
        return {
          status: RecognitionStatus.MATCHED,
          track: {
            title: track.title,
            artist: track.subtitle || 'Artiste inconnu',
            album: this.meta(track, 'album'),
            cover: track.images?.coverarthq ?? track.images?.coverart,
            isrc: track.isrc,
            duration,
          },
          offset: result?.matches?.[0]?.offset,
        } satisfies RecognitionResultDto;
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
