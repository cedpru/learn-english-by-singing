import { useEffect, useRef, useState } from 'react';
import type { Radio } from '../hooks/useRadio';
import type { SongRef } from '../lib/types';

interface Props {
  radio: Radio;
  onDetected: (track: SongRef, startAt: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  connecting: 'connexion au flux…',
  live: 'métadonnées reçues',
  'no-metadata': 'ce flux ne publie pas le titre en cours',
  error: 'flux injoignable',
  stopped: 'arrêté',
};

export function RadioPanel({ radio, onDetected }: Props) {
  const [custom, setCustom] = useState('');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const manualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (radio.session?.status === 'no-metadata') {
      manualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [radio.session?.status]);

  return (
    <div className="panel">
      <div className="presets">
        {radio.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset ${radio.session?.url === preset.url ? 'selected' : ''}`}
            onClick={() => void radio.start(preset.url, preset.name)}
            disabled={radio.starting}
          >
            <strong>{preset.name}</strong>
            <span>{preset.note}</span>
          </button>
        ))}
      </div>

      <div className="custom-stream">
        <input
          type="url"
          placeholder="URL d'un flux radio (mp3 / aac, Icecast ou Shoutcast)"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
        <button
          className="ghost"
          type="button"
          disabled={radio.starting || !/^https?:\/\//.test(custom)}
          onClick={() => void radio.start(custom.trim(), 'Flux personnalisé')}
        >
          Écouter
        </button>
      </div>

      {radio.session && (
        <p className="status">
          <span className={`dot ${radio.session.status}`} /> {radio.session.name} —{' '}
          {STATUS_LABEL[radio.session.status] ?? radio.session.status}
          {radio.session.status === 'live' && radio.session.title
            ? ` · ${radio.session.artist ?? ''} — ${radio.session.title}`
            : ''}
        </p>
      )}
      {radio.error && <p className="error">{radio.error}</p>}

      {(radio.session?.status === 'no-metadata' || radio.session?.status === 'error') && (
        <div className="manual" ref={manualRef}>
          <p>Ce flux n'annonce pas le morceau : saisis-le à la main pour afficher les paroles.</p>
          <div className="row">
            <input placeholder="Artiste" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button
              className="primary"
              type="button"
              disabled={!artist || !title}
              onClick={() => onDetected({ artist, title }, 0)}
            >
              Paroles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
