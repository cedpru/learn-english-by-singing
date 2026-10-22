import type {
  KaraokePayload,
  Preset,
  RadioSession,
  RecognitionResponse,
  SearchResult,
  SongRef,
  StreamSync,
} from './types';

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error ?? `erreur HTTP ${res.status}`);
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
  const res = await fetch('/api/karaoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rawLyrics ? { track, rawLyrics } : { track }),
  });
  return json<KaraokePayload>(res);
}

export async function searchSongs(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  return json<SearchResult[]>(res);
}

export async function fetchPresets(): Promise<Preset[]> {
  return json<Preset[]>(await fetch('/api/presets'));
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
