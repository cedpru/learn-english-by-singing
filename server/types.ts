export interface LyricWord {
  t: number;
  text: string;
}

export interface LyricLine {
  /** seconds, null when the source has no timings */
  t: number | null;
  text: string;
  /** word-level timings when the LRC file is "enhanced" */
  words?: LyricWord[];
  /** french translation, filled by /api/karaoke */
  fr?: string;
}

export interface SongRef {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  cover?: string;
  isrc?: string;
  /** position (seconds) inside the track where the recognised clip started */
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
