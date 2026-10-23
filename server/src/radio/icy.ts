import { EventEmitter } from 'node:events';
import { RadioStatus } from '../common/types';

const USER_AGENT = 'SingAlong/0.1 (personal karaoke assistant)';

export interface IcyMetadata {
  artist?: string;
  title?: string;
  raw?: string;
}

function toInt(value: string | null): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** ICY `StreamTitle='Artist - Title'` → { artist, title }. */
function parseTitle(meta: string): { artist?: string; title?: string } {
  const match = /StreamTitle='([^']*)'/.exec(meta);
  const raw = match?.[1]?.trim() ?? '';
  if (!raw) return {};

  const trim = (value: string) => value.replace(/[\s\-–—]+$/, '').trim();
  const separator = raw.indexOf(' - ');
  if (separator > 0) {
    return { artist: trim(raw.slice(0, separator)), title: trim(raw.slice(separator + 3)) };
  }
  return { title: trim(raw) };
}

/** Removes "Artist - " when a station sends "Artist - Artist - Title". */
function dedupe(artist?: string, title?: string): { artist?: string; title?: string } {
  if (!artist || !title) return { artist, title };
  const prefix = `${artist} - `;
  if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
    return { artist, title: title.slice(prefix.length).trim() };
  }
  return { artist, title };
}

function concat(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const decoder = new TextDecoder('utf-8');

/**
 * One ICY stream reader. Emits `station` (icy-name), `status` (live /
 * no-metadata) and `metadata` when StreamTitle changes.
 */
export class IcyStream extends EventEmitter {
  private readonly controller = new AbortController();
  private stopped = false;

  constructor(private readonly url: string) {
    super();
  }

  get aborted(): boolean {
    return this.stopped;
  }

  stop(): void {
    this.stopped = true;
    this.controller.abort();
  }

  async start(): Promise<void> {
    const response = await fetch(this.url, {
      headers: { 'Icy-MetaData': '1', 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
      signal: this.controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`flux HTTP ${response.status}`);
    }

    const station = response.headers.get('icy-name');
    if (station) this.emit('station', station);

    const metaint = toInt(response.headers.get('icy-metaint'));
    const body = response.body as unknown as AsyncIterable<Uint8Array>;

    if (!metaint) {
      this.emit('status', RadioStatus.NO_METADATA);
      // Keep the connection alive so the station does not think we left, but
      // there is nothing to parse: the UI falls back to manual input.
      try {
        for await (const _chunk of body) {
          if (this.stopped) return;
        }
      } catch {
        /* aborted or broken: nothing to report */
      }
      return;
    }

    this.emit('status', RadioStatus.LIVE);

    let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let remaining = metaint;
    let metaLength = 0;

    for await (const chunk of body) {
      buffer = concat(buffer, chunk);

      let progress = true;
      while (progress) {
        progress = false;

        // Skip the audio block: metadata only starts after `metaint` bytes.
        if (remaining > 0) {
          if (buffer.length === 0) break;
          const take = Math.min(remaining, buffer.length);
          buffer = buffer.subarray(take);
          remaining -= take;
          progress = true;
          continue;
        }

        if (metaLength === 0) {
          if (buffer.length < 1) break;
          metaLength = buffer[0] * 16;
          buffer = buffer.subarray(1);
          if (metaLength === 0) {
            remaining = metaint;
            progress = true;
            continue;
          }
          progress = true;
          continue;
        }

        if (buffer.length < metaLength) break;

        const raw = decoder.decode(buffer.subarray(0, metaLength)).replace(/\0+$/, '');
        buffer = buffer.subarray(metaLength);
        metaLength = 0;
        remaining = metaint;

        const parsed = parseTitle(raw);
        if (parsed.title) {
          const final = dedupe(parsed.artist, parsed.title);
          this.emit('metadata', { ...final, raw } satisfies IcyMetadata);
        }
        progress = true;
      }
    }

    if (!this.stopped) throw new Error('flux interrompu');
  }
}
