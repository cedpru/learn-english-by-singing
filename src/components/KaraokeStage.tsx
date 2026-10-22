import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SongClock } from '../hooks/useSongClock';
import { formatLrcStamp, linesToLrc } from '../lib/customLyrics';
import { activeLineIndex, activeWordIndex, formatTime } from '../lib/lrc';
import type { KaraokePayload, SongRef } from '../lib/types';

export interface Transport {
  /** true when the app owns the audio (radio stream) */
  available: boolean;
  playing: boolean;
  volume: number;
  muted: boolean;
  toggle: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
}

interface Props {
  track: SongRef;
  payload: KaraokePayload | null;
  clock: SongClock;
  loading: boolean;
  error: string | null;
  /** the clock was anchored on the audio itself (Shazam on the radio stream) */
  autoSynced: boolean;
  /** persistent timing correction added to the LRC timestamps */
  shift: number;
  transport: Transport;
  onShift: (delta: number) => void;
  onTapLine: (lineTime: number) => void;
  onBack: () => void;
  onRetry: () => void;
  /** custom lyrics (null removes them): replaces the online entry for this track */
  onSaveLyrics: (raw: string | null) => void;
}

interface Recorder {
  /** index of the line waiting for its timestamp */
  index: number;
  times: number[];
}

const BADGES: Record<KaraokePayload['translation'], { label: string; tone: string } | null> = {
  ok: { label: '🇫🇷 traduction auto', tone: 'ok' },
  approximate: { label: 'traduction approximative (langue détectée incertaine)', tone: 'warn' },
  'already-target': { label: 'paroles déjà en français', tone: 'neutral' },
  unsupported: { label: 'pas de traduction : langue non latine', tone: 'warn' },
  empty: null,
};

export function KaraokeStage({
  track,
  payload,
  clock,
  loading,
  error,
  autoSynced,
  shift,
  transport,
  onShift,
  onTapLine,
  onBack,
  onRetry,
  onSaveLyrics,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [recorder, setRecorder] = useState<Recorder | null>(null);

  const lyricTime = clock.position - shift;

  const active = useMemo(
    () => (payload?.synced ? activeLineIndex(payload.lines, lyricTime) : -1),
    [payload, lyricTime],
  );

  useEffect(() => {
    if (active < 0) return;
    const el = lineRefs.current[active];
    const container = scrollerRef.current;
    if (!el || !container) return;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [active]);

  const openEditor = useCallback(() => {
    setRecorder(null);
    setDraft(payload ? linesToLrc(payload.lines) : '');
    setEditing(true);
  }, [payload]);

  const stampLine = useCallback(() => {
    setRecorder((previous) => {
      if (!previous) return previous;
      const last = previous.times[previous.times.length - 1] ?? -1;
      const time = Math.max(clock.position, last + 0.2);
      return { index: previous.index + 1, times: [...previous.times, time] };
    });
  }, [clock.position]);

  /** Writes the tapped timings as an LRC text, then hands it to the app. */
  const finishRecording = useCallback(() => {
    if (!payload || !recorder) return;
    const lrc = payload.lines
      .map((line, index) => {
        const time = recorder.times[index];
        return time === undefined ? line.text : `${formatLrcStamp(time)}${line.text}`;
      })
      .join('\n');
    setRecorder(null);
    onSaveLyrics(lrc);
  }, [onSaveLyrics, payload, recorder]);

  useEffect(() => {
    if (!recorder) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // a focused button already turns Enter into a click, which stamps the line
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (clock.playing) stampLine();
      }
      if (event.key === 'Escape') setRecorder(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock.playing, recorder, stampLine]);

  // the last line stamped: nothing left to tap, save the result
  useEffect(() => {
    if (recorder && payload && recorder.times.length >= payload.lines.length) finishRecording();
  }, [finishRecording, payload, recorder]);

  const activeWords = payload?.wordSync ? activeWordIndex(payload?.lines[active], lyricTime) : -1;
  const badge = payload ? BADGES[payload.translation] : null;
  // LRCLIB occasionally carries the duration of another version (live, radio
  // edit…): if the song outlives it, stop pretending to know the total.
  const rawTotal = payload?.track.duration ?? track.duration ?? 0;
  const total = rawTotal && clock.position <= rawTotal + 5 ? rawTotal : 0;

  return (
    <section className="stage">
      <div className="stage-top">
        <button className="ghost" onClick={onBack} type="button">
          ← Changer de source
        </button>
        <div className="track">
          {track.cover ? (
            <img className="cover" src={track.cover} alt="" />
          ) : (
            <div className="cover cover-fallback">♪</div>
          )}
          <div className="track-meta">
            <h1>{track.title}</h1>
            <p>{track.artist}</p>
          </div>
        </div>
        <div className="badges">
          {payload?.synced && <span className="badge ok">paroles synchronisées</span>}
          {autoSynced && <span className="badge ok">calé sur l'audio</span>}
          {payload?.provider === 'manuel' && <span className="badge neutral">paroles maison</span>}
          {badge && <span className={`badge ${badge.tone}`}>{badge.label}</span>}
          {payload && (
            <button className="ghost tiny" type="button" onClick={openEditor} title="Coller les paroles ou corriger les timings">
              ✎ paroles
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="stage-state">
          <div className="spinner" />
          <p>Recherche des paroles et traduction…</p>
          <small>Le premier morceau télécharge le modèle de traduction (~120 Mo), ensuite tout est local.</small>
        </div>
      )}

      {!loading && error && (
        <div className="stage-state">
          <p className="error">{error}</p>
          <button className="primary" onClick={onRetry} type="button">
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && payload && (
        <>
          {payload.instrumental && (
            <div className="stage-state">
              <p>🎧 Morceau instrumental — pas de paroles à chanter.</p>
            </div>
          )}

          {!payload.instrumental && !payload.lines.length && (
            <div className="stage-state">
              <p>Paroles introuvables pour ce titre.</p>
              <small>
                {payload.provider} n'a pas d'entrée pour « {track.artist} — {track.title} ». Colle-les
                à la main : elles seront gardées pour ce titre.
              </small>
              <button className="primary" type="button" onClick={openEditor}>
                ✎ Ajouter les paroles
              </button>
            </div>
          )}

          {recorder && payload && (
            <div className="recorder">
              <p className="recorder-step">
                Ligne {Math.min(recorder.index + 1, payload.lines.length)} / {payload.lines.length}
              </p>
              <p className="recorder-current">{payload.lines[recorder.index]?.text ?? 'Dernière ligne'}</p>
              {payload.lines[recorder.index + 1] && (
                <p className="recorder-next">Ensuite : {payload.lines[recorder.index + 1].text}</p>
              )}
              <div className="recorder-actions">
                <button className="primary" type="button" onClick={stampLine} disabled={!clock.playing}>
                  ↵ Ligne chantée
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={finishRecording}
                  disabled={!recorder.times.length}
                >
                  Terminer
                </button>
                <button className="ghost" type="button" onClick={() => setRecorder(null)}>
                  Annuler
                </button>
              </div>
              <p className="hint">
                {clock.playing
                  ? 'Appuie sur Entrée au début de chaque ligne chantée.'
                  : 'Lance la lecture (Espace), puis appuie sur Entrée au début de chaque ligne.'}
              </p>
            </div>
          )}

          {!recorder && !!payload.lines.length && (
            <div className={`lyrics ${payload.synced ? 'is-synced' : 'is-plain'}`} ref={scrollerRef}>
              <div className="lyrics-inner">
              {!payload.synced && (
                <div className="sync-warning">
                  <span>Paroles non synchronisées — affichage complet, défilement libre.</span>
                  <button
                    className="ghost tiny"
                    type="button"
                    onClick={() => setRecorder({ index: 0, times: [] })}
                  >
                    ⏱ Caler en rythme
                  </button>
                </div>
              )}
              {payload.lines.map((line, index) => {
                const isActive = index === active;
                const showWords = isActive && payload.wordSync && line.words?.length;
                return (
                  <div
                    key={`${line.t ?? 'x'}-${index}`}
                    ref={(el) => {
                      lineRefs.current[index] = el;
                    }}
                    onClick={() => {
                      if (payload.synced && line.t !== null) onTapLine(line.t);
                    }}
                    title={payload.synced ? 'Toucher pour recaler les paroles sur cette ligne' : undefined}
                    className={`line ${isActive ? 'active' : ''} ${payload.synced && index < active ? 'past' : ''} ${payload.synced ? 'clickable' : ''}`}
                  >
                    <p className="en">
                      {showWords
                        ? line.words!.map((word, wi) => (
                            <span key={`${wi}-${word.t}`} className={wi <= activeWords ? 'word on' : 'word'}>
                              {word.text}{' '}
                            </span>
                          ))
                        : line.text}
                    </p>
                    {line.fr && <p className="fr">{line.fr}</p>}
                  </div>
                );
              })}
              </div>
            </div>
          )}

          <div className="stage-controls">
            <button
              className="round"
              onClick={() => (transport.available ? transport.toggle() : clock.playing ? clock.pause() : clock.resume())}
              type="button"
              aria-label={(transport.available ? transport.playing : clock.playing) ? 'Pause' : 'Lecture'}
            >
              {(transport.available ? transport.playing : clock.playing) ? '❚❚' : '▶'}
            </button>
            <button className="round small" onClick={() => onShift(-3)} type="button" title="Les paroles arrivent trop tard : les avancer de 3 s">
              −3s
            </button>
            <button className="round small" onClick={() => onShift(3)} type="button" title="Les paroles arrivent trop tôt : les retarder de 3 s">
              +3s
            </button>
            <div className={`progress ${total ? '' : 'live'}`}>
              <div
                className="progress-fill"
                style={total ? { width: `${Math.min(100, (clock.position / total) * 100)}%` } : undefined}
              />
            </div>
            <span className="time">
              {formatTime(clock.position)}
              {total ? ` / ${formatTime(total)}` : ''}
            </span>
            {transport.available && (
              <div className="volume">
                <button
                  className="icon"
                  type="button"
                  onClick={transport.toggleMute}
                  aria-label={transport.muted ? 'Rétablir le son' : 'Couper le son'}
                  title={transport.muted ? 'Rétablir le son (M)' : 'Couper le son (M)'}
                >
                  {transport.muted || transport.volume === 0 ? '🔇' : '🔈'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={transport.muted ? 0 : transport.volume}
                  onChange={(event) => transport.setVolume(Number(event.target.value))}
                  aria-label="Volume"
                  title="Volume (↑ ↓)"
                />
              </div>
            )}
          </div>
          <p className="hint">
            {shift !== 0 ? `Décalage appliqué : ${shift > 0 ? '+' : ''}${shift.toFixed(1)} s (mémorisé pour ce titre). ` : ''}
            {transport.available ? (
              <>
                Espace met en pause, ↑ ↓ règlent le volume, M coupe le son. Si les paroles sont
                décalées, touche la ligne en cours de chant ou utilise −3s / +3s.
              </>
            ) : (
              <>
                Aucun son ici : mets le morceau sur ta radio ou ton lecteur, puis touche la ligne
                qui se chante pour caler les paroles. −3s / +3s corrigent un petit décalage.
              </>
            )}
          </p>
        </>
      )}

      {editing && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Paroles personnalisées">
            <h2>Paroles de « {track.artist} — {track.title} »</h2>
            <p className="modal-lead">
              Colle les paroles (une ligne par phrase) ou importe un fichier .lrc pour avoir les
              timings. C'est enregistré sur cet appareil et réutilisé pour ce titre.
            </p>
            <label className="ghost file">
              Importer un .lrc / .txt
              <input
                type="file"
                accept=".lrc,.txt,text/plain"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) setDraft(await file.text());
                }}
              />
            </label>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              placeholder={'[00:12.40]Première ligne\n[00:16.10]Deuxième ligne\n\n… ou juste le texte, sans timings'}
              autoFocus
            />
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setEditing(false)}>
                Annuler
              </button>
              {payload?.provider === 'manuel' && (
                <button
                  className="ghost danger"
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    onSaveLyrics(null);
                  }}
                >
                  Retirer
                </button>
              )}
              <button
                className="primary"
                type="button"
                disabled={!draft.trim()}
                onClick={() => {
                  setEditing(false);
                  onSaveLyrics(draft);
                }}
              >
                Enregistrer et charger
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
