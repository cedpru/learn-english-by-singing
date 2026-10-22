import { useEffect, useState } from 'react';
import { searchSongs } from '../lib/api';
import type { SearchResult, SongRef } from '../lib/types';

interface Props {
  onDetected: (track: SongRef, startAt: number) => void;
}

export function SearchPanel({ onDetected }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const found = await searchSongs(query.trim());
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  return (
    <div className="panel">
      <input
        className="search-input"
        placeholder="Chercher un morceau : « The Killers Mr Brightside »"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      {loading && <p className="status">Recherche…</p>}
      {error && <p className="error">{error}</p>}
      <ul className="results">
        {results.map((result) => (
          <li key={result.id}>
            <button
              type="button"
              onClick={() =>
                onDetected(
                  {
                    artist: result.artist,
                    title: result.title,
                    album: result.album,
                    duration: result.duration,
                  },
                  0,
                )
              }
            >
              <span>
                <strong>{result.title}</strong>
                <em>{result.artist}</em>
              </span>
              <span className="tags">
                {result.synced ? <span className="badge ok">synchronisé</span> : <span className="badge">texte seul</span>}
                {result.duration ? <span className="badge">{Math.round(result.duration / 60)} min</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!loading && query.trim().length > 1 && !results.length && !error && (
        <div className="manual">
          <p className="status">
            Rien dans LRCLIB pour cette recherche. Charge le titre pour coller les paroles à la
            main.
          </p>
          <div className="row">
            <input placeholder="Artiste" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button
              className="primary"
              type="button"
              disabled={!artist.trim() || !title.trim()}
              onClick={() => onDetected({ artist: artist.trim(), title: title.trim() }, 0)}
            >
              Charger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
