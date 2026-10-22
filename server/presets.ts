export interface Preset {
  id: string;
  name: string;
  url: string;
  note: string;
}

/** Streams that publish ICY `StreamTitle` metadata (so the current song is known). */
export const PRESETS: Preset[] = [
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
