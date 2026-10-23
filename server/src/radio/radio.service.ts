import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestCustomException, NotFoundCustomException } from '../common/exceptions/custom-exceptions';
import {
  RadioSessionDto,
  RadioStatus,
  RecognitionStatus,
  StreamSyncDto,
  SyncStatus,
} from '../common/types';
import { RecognitionService } from '../recognition/recognition.service';
import { IcyMetadata, IcyStream } from './icy';

const DEFAULT_NAME = 'Flux personnalisé';
const CLIP_SECONDS = 8;
const MIN_CAPTURE_BYTES = 20_000;
/** A page reload leaves the client with no session id: drop streams nobody polls. */
const IDLE_TIMEOUT_MS = 90_000;

/** Streams that publish ICY `StreamTitle` metadata (so the current song is known). */
const PRESETS = [
  {
    id: 'radio-paradise',
    name: 'Radio Paradise — Main Mix',
    url: 'https://stream.radioparadise.com/aac-128',
    note: 'Rock / indie anglophone, métadonnées fiables',
  },
  {
    id: 'radio-paradise-mellow',
    name: 'Radio Paradise — Mellow Mix',
    url: 'https://stream.radioparadise.com/mellow-128',
    note: 'Plus calme, anglophone',
  },
  {
    id: 'radio-paradise-rock',
    name: 'Radio Paradise — Rock Mix',
    url: 'https://stream.radioparadise.com/rock-128',
    note: 'Rock, anglophone',
  },
  {
    id: 'kexp',
    name: 'KEXP 90.3 — Seattle',
    url: 'https://kexp.streamguys1.com/kexp160.aac',
    note: 'Indie / alternative, anglophone',
  },
  {
    id: 'skyrock',
    name: 'Skyrock',
    url: 'https://icecast.skyrock.net/s/natio_mp3_128k',
    note: 'Hits rap / R&B (FR + US)',
  },
  {
    id: 'fip',
    name: 'FIP',
    url: 'https://icecast.radiofrance.fr/fip-midfi.mp3',
    note: 'Éclectique — sans métadonnées, saisie manuelle',
  },
];

@Injectable()
export class RadioService implements OnModuleDestroy {
  private readonly logger = new Logger(RadioService.name);
  private readonly sessions = new Map<string, RadioSessionDto>();
  private readonly lastSeen = new Map<string, number>();
  private readonly streams = new Map<string, IcyStream>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly syncJobs = new Map<string, Promise<StreamSyncDto>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly recognitionService: RecognitionService,
  ) {
    this.sweeper = setInterval(() => this.dropIdleSessions(), 30_000);
    this.sweeper.unref?.();
  }

  getPresets() {
    return PRESETS;
  }

  startRadio(url: string, name?: string): RadioSessionDto {
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestCustomException('URL de flux invalide', 'INVALID_URL');
    }

    const id = randomUUID();
    const session: RadioSessionDto = {
      id,
      url,
      name: name?.trim() || DEFAULT_NAME,
      status: RadioStatus.CONNECTING,
      artist: null,
      title: null,
      album: null,
      changedAt: null,
    };

    this.sessions.set(id, session);
    this.lastSeen.set(id, Date.now());
    this.connect(id, url, 0);
    return { ...session };
  }

  stopRadio(id: string): boolean {
    if (!this.sessions.has(id)) return false;
    this.cleanup(id);
    return true;
  }

  getRadio(id: string): RadioSessionDto | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    this.lastSeen.set(id, Date.now());
    return { ...session };
  }

  listRadios(): RadioSessionDto[] {
    return [...this.sessions.values()].map((session) => ({ ...session }));
  }

  /**
   * Captures the live stream and asks Shazam where the song actually is. ICY
   * metadata only tells us *which* track plays, never the position.
   */
  async syncRadio(id: string): Promise<StreamSyncDto> {
    const session = this.getRadio(id);
    if (!session) throw new NotFoundCustomException('Session introuvable', 'SESSION_NOT_FOUND');
    if (session.status !== RadioStatus.LIVE) {
      throw new NotFoundCustomException(
        'Ce flux ne publie pas de métadonnées',
        'NO_METADATA',
      );
    }

    const key = `${session.id}|${session.title ?? ''}`;
    let job = this.syncJobs.get(key);
    if (!job) {
      job = this.captureAndRecognize(session.url);
      this.syncJobs.set(key, job);
      void job.finally(() => setTimeout(() => this.syncJobs.delete(key), 30_000));
    }
    return job;
  }

  private updateSession(id: string, metadata: Partial<RadioSessionDto>): RadioSessionDto | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const next = { ...session, ...metadata };
    this.sessions.set(id, next);
    return next;
  }

  private connect(id: string, url: string, attempt: number): void {
    if (!this.sessions.has(id)) return;

    const stream = new IcyStream(url);
    this.streams.get(id)?.stop();
    this.streams.set(id, stream);

    stream.on('station', (station: string) => {
      const session = this.sessions.get(id);
      if (session && session.name === DEFAULT_NAME) {
        this.updateSession(id, { name: station });
      }
    });

    stream.on('status', (status: RadioStatus) => {
      this.updateSession(id, { status });
    });

    stream.on('metadata', (metadata: IcyMetadata) => {
      this.updateSession(id, {
        artist: metadata.artist ?? null,
        title: metadata.title ?? null,
        status: RadioStatus.LIVE,
        changedAt: Date.now(),
      });
    });

    void stream.start().catch((error: unknown) => {
      if (stream.aborted || !this.sessions.has(id)) return;
      const message = (error as Error).message || 'flux interrompu';

      if (attempt < 3) {
        this.updateSession(id, { status: RadioStatus.CONNECTING });
        const timer = setTimeout(() => {
          this.retryTimers.delete(id);
          this.connect(id, url, attempt + 1);
        }, 1500 * (attempt + 1));
        timer.unref?.();
        this.retryTimers.set(id, timer);
        return;
      }

      this.updateSession(id, { status: RadioStatus.ERROR });
      this.logger.warn(`flux ${url} : ${message}`);
    });
  }

  private cleanup(id: string): void {
    this.streams.get(id)?.stop();
    this.streams.delete(id);
    const timer = this.retryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.retryTimers.delete(id);
    this.sessions.delete(id);
    this.lastSeen.delete(id);
    for (const key of [...this.syncJobs.keys()]) {
      if (key.startsWith(`${id}|`)) this.syncJobs.delete(key);
    }
  }

  private dropIdleSessions(): void {
    const now = Date.now();
    for (const [id, seen] of this.lastSeen) {
      if (now - seen > IDLE_TIMEOUT_MS) this.cleanup(id);
    }
  }

  private ffmpegPath(): string {
    return this.configService.get<string>('FFMPEG_PATH') || ffmpeg.path;
  }

  /** Records `seconds` of the live stream to a wav file with the bundled ffmpeg. */
  private recordStream(url: string, output: string, seconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.ffmpegPath(),
        [
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
          output,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
      );

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const killer = setTimeout(() => child.kill('SIGKILL'), (seconds + 12) * 1000);
      child.on('error', (error) => {
        clearTimeout(killer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(killer);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg exit ${code}`));
      });
    });
  }

  private async captureAndRecognize(streamUrl: string): Promise<StreamSyncDto> {
    const capturedAt = Date.now();
    const dir = await mkdtemp(path.join(tmpdir(), 'singalong-sync-'));
    const output = path.join(dir, 'capture.wav');

    try {
      await this.recordStream(streamUrl, output, CLIP_SECONDS);

      const info = await stat(output).catch(() => null);
      if (!info || info.size < MIN_CAPTURE_BYTES) {
        return this.noMatch(capturedAt);
      }

      const buffer = await readFile(output);
      const recognition = await this.recognitionService.recognizeAudio(buffer);
      if (!recognition || recognition.status !== RecognitionStatus.MATCHED || !recognition.track) {
        return this.noMatch(capturedAt);
      }

      return {
        status: SyncStatus.MATCHED,
        track: recognition.track,
        offset: recognition.offset ?? 0,
        capturedAt,
        clipSeconds: CLIP_SECONDS,
      };
    } catch (error) {
      // A station we cannot identify must not turn into a stream of 502s.
      this.logger.warn(`synchronisation impossible : ${(error as Error).message}`);
      return this.noMatch(capturedAt);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private noMatch(capturedAt: number): StreamSyncDto {
    return { status: SyncStatus.NO_MATCH, capturedAt, clipSeconds: CLIP_SECONDS };
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    for (const id of [...this.sessions.keys()]) this.cleanup(id);
  }
}
