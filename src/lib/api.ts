import type {
  KaraokePayload,
  Preset,
  RadioSession,
  RecognitionResponse,
  SearchResult,
  SongRef,
  StreamSync,
} from './types';

/** NestJS answers `{ statusCode, message, errorCode, path, timestamp }`. */
function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length) return message.join(', ');
    if (typeof error === 'string' && error) return error;
  }
  return `erreur HTTP ${status}`;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: T | null = null;
  try {
    body = text ? (JSON.parse(text) as T) : null;
  } catch {
    // A dev server without the API proxy answers HTML.
    if (res.ok) throw new Error('réponse illisible');
  }
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  return body as T;
}

export async function recognizeClip(blob: Blob): Promise<RecognitionResponse> {
  const res = await fetch('/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  return json<RecognitionResponse>(res);
}

export async function fetchKaraoke(track: SongRef, rawLyrics?: string | null): Promise<KaraokePayload> {
  const res = await fetch('/api/lyrics/karaoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rawLyrics ? { track, rawLyrics } : { track }),
  });
  return json<KaraokePayload>(res);
}

export async function searchSongs(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/lyrics/search?q=${encodeURIComponent(q)}`);
  return json<SearchResult[]>(res);
}

export async function fetchPresets(): Promise<Preset[]> {
  return json<Preset[]>(await fetch('/api/radio/presets'));
}

export async function startRadio(url: string, name?: string): Promise<RadioSession> {
  const res = await fetch('/api/radio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name }),
  });
  return json<RadioSession>(res);
}

export async function pollRadio(id: string): Promise<RadioSession> {
  return json<RadioSession>(await fetch(`/api/radio/${id}`));
}

/** Records a few seconds of the live stream server-side to locate the song position. */
export async function syncRadio(id: string): Promise<StreamSync> {
  const res = await fetch(`/api/radio/${id}/sync`, { method: 'POST' });
  return json<StreamSync>(res);
}

export async function stopRadio(id: string): Promise<void> {
  await fetch(`/api/radio/${id}`, { method: 'DELETE' });
}
