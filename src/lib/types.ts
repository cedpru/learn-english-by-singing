export interface LyricWord {
  t: number;
  text: string;
}

export interface LyricLine {
  t: number | null;
  text: string;
  words?: LyricWord[];
  fr?: string;
}

export interface SongRef {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  cover?: string;
  isrc?: string;
  offset?: number;
}

export interface KaraokePayload {
  track: SongRef;
  lines: LyricLine[];
  synced: boolean;
  wordSync: boolean;
  instrumental: boolean;
  sourceLang: string;
  translation: 'ok' | 'approximate' | 'already-target' | 'unsupported' | 'empty';
  provider: string;
}

export interface RecognitionResponse {
  status: 'matched' | 'no_match';
  track?: SongRef;
  error?: string;
}

export interface SearchResult {
  id: number;
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  synced: boolean;
  instrumental: boolean;
}

export interface Preset {
  id: string;
  name: string;
  url: string;
  note: string;
}

export interface StreamSync {
  status: 'matched' | 'no_match';
  track?: SongRef;
  /** position of the captured clip inside the track, in seconds */
  offset?: number;
  /** epoch ms when the capture started */
  capturedAt: number;
  clipSeconds: number;
}

export interface RadioSession {
  id: string;
  url: string;
  name: string;
  status: 'connecting' | 'live' | 'no-metadata' | 'error' | 'stopped';
  error?: string;
  artist?: string;
  title?: string;
  changedAt?: number;
  connectedAt: number;
}
