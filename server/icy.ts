import { randomUUID } from 'node:crypto';

export interface RadioSession {
  id: string;
  url: string;
  name: string;
  status: 'connecting' | 'live' | 'no-metadata' | 'error' | 'stopped';
  error?: string;
  artist?: string;
  title?: string;
  raw?: string;
  /** epoch ms of the last metadata change, used to estimate the song position */
  changedAt?: number;
  connectedAt: number;
}

interface Internal extends RadioSession {
  controller?: AbortController;
  retries: number;
  /** last time a client asked about this session */
  lastSeen: number;
}

const sessions = new Map<string, Internal>();
const decoder = new TextDecoder('utf-8');

function toInt(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseTitle(meta: string): { artist?: string; title?: string } {
  const match = /StreamTitle='([^']*)'/.exec(meta);
  const raw = match?.[1]?.trim() ?? '';
  if (!raw) return {};
  const trim = (value: string) => value.replace(/[\s\-–—]+$/, '').trim();
  const sep = raw.indexOf(' - ');
  if (sep > 0) {
    return { artist: trim(raw.slice(0, sep)), title: trim(raw.slice(sep + 3)) };
  }
  return { title: trim(raw) };
}

/** Removes "Artist - " when a station sends "Artist - Artist - Title". */
function dedupe(artist?: string, title?: string) {
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

async function run(session: Internal): Promise<void> {
  const controller = new AbortController();
  session.controller = controller;

  const res = await fetch(session.url, {
    headers: {
      'Icy-MetaData': '1',
      'User-Agent': 'SingAlong/0.1 (personal karaoke assistant)',
      Accept: '*/*',
    },
    redirect: 'follow',
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`flux HTTP ${res.status}`);
  }

  const headerName = res.headers.get('icy-name');
  if (headerName && session.name === 'Flux personnalisé') session.name = headerName;

  const metaint = toInt(res.headers.get('icy-metaint'));
  if (!metaint) {
    session.status = 'no-metadata';
    // Keep the connection alive so the station does not think we left, but there
    // is nothing to parse: the UI falls back to manual input.
    void (async () => {
      try {
        for await (const _ of res.body as unknown as AsyncIterable<Uint8Array>) {
          if (controller.signal.aborted) break;
        }
      } catch {
        /* ignore */
      }
    })();
    return;
  }

  session.status = 'live';
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let remaining = metaint;
  let metaLength = 0;

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer = concat(buffer, chunk);

    let progress = true;
    while (progress) {
      progress = false;
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
      const meta = decoder.decode(buffer.subarray(0, metaLength)).replace(/\0+$/, '');
      buffer = buffer.subarray(metaLength);
      metaLength = 0;
      remaining = metaint;

      const parsed = parseTitle(meta);
      if (parsed.title) {
        const final = dedupe(parsed.artist, parsed.title);
        const changed = final.title !== session.title || final.artist !== session.artist;
        session.title = final.title;
        session.artist = final.artist;
        session.raw = meta;
        if (changed) session.changedAt = Date.now();
      }
      progress = true;
    }
  }

  throw new Error('flux interrompu');
}

function supervise(session: Internal): void {
  void (async () => {
    try {
      await run(session);
    } catch (err) {
      if (session.controller?.signal.aborted) {
        session.status = 'stopped';
        return;
      }
      session.error = (err as Error).message;
      if (session.retries < 3) {
        session.retries += 1;
        setTimeout(() => supervise(session), 1500 * session.retries);
        session.status = 'connecting';
        return;
      }
      session.status = 'error';
    }
  })();
}

export function startRadio(url: string, name = 'Flux personnalisé'): RadioSession {
  const id = randomUUID();
  const session: Internal = {
    id,
    url,
    name,
    status: 'connecting',
    connectedAt: Date.now(),
    retries: 0,
    lastSeen: Date.now(),
  };
  sessions.set(id, session);
  supervise(session);
  return session;
}

export function stopRadio(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.controller?.abort();
  session.status = 'stopped';
  sessions.delete(id);
  return true;
}

export function getRadio(id: string): RadioSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  session.lastSeen = Date.now();
  const { controller: _controller, retries: _retries, lastSeen: _lastSeen, ...rest } = session;
  return rest;
}

// A page reload leaves the client with no session id: drop streams nobody polls.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > 90_000) {
      session.controller?.abort();
      sessions.delete(id);
    }
  }
}, 30_000);
sweeper.unref?.();

export function listRadios(): RadioSession[] {
  return [...sessions.keys()].map((id) => getRadio(id)!).filter(Boolean);
}
