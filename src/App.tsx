import { useCallback, useEffect, useRef, useState } from 'react';
import { KaraokeStage } from './components/KaraokeStage';
import { MicPanel } from './components/MicPanel';
import { RadioPanel } from './components/RadioPanel';
import { SearchPanel } from './components/SearchPanel';
import { useRadio } from './hooks/useRadio';
import { useSongClock } from './hooks/useSongClock';
import { fetchKaraoke, syncRadio } from './lib/api';
import { readCustomLyrics, saveCustomLyrics } from './lib/customLyrics';
import type { Transport } from './components/KaraokeStage';
import type { KaraokePayload, SongRef } from './lib/types';

type Mode = 'mic' | 'radio' | 'search';

const MODES: { id: Mode; label: string }[] = [
  { id: 'mic', label: '🎤 Autour de moi' },
  { id: 'radio', label: '📡 Radio' },
  { id: 'search', label: '🔎 Chercher un titre' },
];

const INTRO: Record<Mode, { title: string; highlight: string; text: string }> = {
  mic: {
    title: 'Chante juste, même quand tu ne connais pas',
    highlight: 'les paroles',
    text: "Le micro reconnaît le morceau qui passe à la radio, à la télé ou sur ton enceinte, récupère les paroles synchronisées et les traduit en français — sans quitter l'écran des yeux.",
  },
  radio: {
    title: 'La radio devient un karaoké',
    highlight: 'bilingue',
    text: "Choisis une station : le titre en cours est détecté tout seul, avec les paroles anglaises et leur traduction en français. Le morceau suivant s'enchaîne automatiquement.",
  },
  search: {
    title: 'Retrouve les paroles d’un titre et sa',
    highlight: 'traduction',
    text: "Pratique pour répéter avant de chanter : cherche un morceau, les paroles défilent avec le chrono.",
  },
};

interface Current {
  track: SongRef;
  startAt: number;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Guards against anchoring the clock on a different song than the announced one. */
const VOLUME_KEY = 'singalong:volume';

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const value = Number(raw);
    if (raw !== null && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  } catch {
    /* ignore */
  }
  return 0.8;
}

const shiftKey = (track: SongRef) => `singalong:shift:${normalize(track.artist)}|${normalize(track.title)}`;

/** Remembered correction for a track: LRCLIB timings are crowd-sourced and often a bit off. */
function readShift(track: SongRef): number {
  try {
    const raw = localStorage.getItem(shiftKey(track));
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function sameSong(a: SongRef, b: SongRef): boolean {
  const ta = normalize(a.title);
  const tb = normalize(b.title);
  const aa = normalize(a.artist);
  const ab = normalize(b.artist);
  const titleOk = !!ta && !!tb && (ta === tb || ta.includes(tb) || tb.includes(ta));
  const artistOk = !!aa && !!ab && (aa === ab || aa.includes(ab) || ab.includes(aa));
  return titleOk && artistOk;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('mic');
  const [current, setCurrent] = useState<Current | null>(null);
  const [payload, setPayload] = useState<KaraokePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSynced, setAutoSynced] = useState(false);
  const [shift, setShift] = useState(0);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [syncEpoch, setSyncEpoch] = useState(0);
  const pausedAt = useRef<number | null>(null);
  const clock = useSongClock();
  const requestId = useRef(0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const audioRef = useRef<HTMLAudioElement>(null);
  const stateRef = useRef({ current, shift });
  stateRef.current = { current, shift };
  /** id of the load whose clock was already anchored by the audio analysis */
  const anchoredId = useRef(-1);

  /**
   * Anchors the lyric clock. When the app owns the audio (radio), the clock only
   * runs if the stream actually plays, so pausing the music freezes the lyrics.
   */
  const anchorClock = useCallback((position: number) => {
    const timer = clockRef.current;
    const audio = audioRef.current;
    if (audio && audio.paused) timer.seekTo(position);
    else timer.start(position);
  }, []);

  const load = useCallback(
    async (track: SongRef, startAt: number) => {
      const id = ++requestId.current;
      const origin = Date.now();
      setCurrent({ track, startAt });
      setPayload(null);
      setError(null);
      setAutoSynced(false);
      setShift(readShift(track));
      setLoading(true);
      try {
        const data = await fetchKaraoke(track, readCustomLyrics(track));
        if (id !== requestId.current) return;
        setPayload(data);
        if (anchoredId.current !== id) {
          // the audio analysis may have anchored the clock while we were fetching
          anchorClock(startAt + (Date.now() - origin) / 1000);
        }
      } catch (err) {
        if (id !== requestId.current) return;
        setError((err as Error).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [anchorClock],
  );

  const radio = useRadio(load);
  const { stop: stopRadio } = radio;

  const setShiftValue = useCallback((value: number) => {
    const next = Math.round(value * 10) / 10;
    // Several presses can land before the next render: keep the ref in step so
    // −3s / +3s accumulate instead of collapsing into a single step.
    stateRef.current.shift = next;
    setShift(next);
    const track = stateRef.current.current?.track;
    if (!track) return;
    try {
      localStorage.setItem(shiftKey(track), String(next));
    } catch {
      /* storage may be unavailable, the shift still applies for this session */
    }
  }, []);

  const bumpShift = useCallback(
    (delta: number) => setShiftValue(stateRef.current.shift + delta),
    [setShiftValue],
  );

  const tapLine = useCallback(
    (lineTime: number) => setShiftValue(clockRef.current.position - lineTime),
    [setShiftValue],
  );

  /**
   * Stores lyrics entered by the user (or forgets them) and reloads the stage at
   * the current position, so a track missing from LRCLIB still becomes a karaoke.
   */
  const saveLyrics = useCallback(
    async (raw: string | null) => {
      const track = stateRef.current.current?.track;
      if (!track) return;
      saveCustomLyrics(track, raw);
      // new timings: a correction tuned for the previous lyrics no longer applies
      setShiftValue(0);
      await load(track, clockRef.current.position);
    },
    [load, setShiftValue],
  );

  const applyVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, Math.round(value * 100) / 100));
    setVolumeState(next);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = next;
      if (next > 0 && audio.muted) {
        audio.muted = false;
        setMuted(false);
      }
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    setMuted((previous) => {
      const next = !previous;
      if (audio) audio.muted = next;
      return next;
    });
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      // no app-owned audio (micro / recherche): the button drives the lyric clock
      const timer = clockRef.current;
      if (timer.playing) timer.pause();
      else timer.resume();
      return;
    }
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const back = useCallback(() => {
    requestId.current += 1;
    anchoredId.current = -1;
    setCurrent(null);
    setPayload(null);
    setError(null);
    setAutoSynced(false);
    setLoading(false);
    clock.reset();
    void stopRadio();
  }, [clock, stopRadio]);

  // the stream element is recreated whenever the station changes: restore the
  // saved volume and make sure playback actually started (autoplay can be blocked)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    audio.play().then(
      () => setAudioPlaying(true),
      () => setAudioPlaying(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radio.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  /**
   * ICY metadata says *which* song plays, not *where* we are in it. As soon as a
   * radio track is shown, grab a few seconds of the stream and let Shazam give
   * the real position, so the lyrics no longer start at 0 on a song already
   * halfway through.
   */
  const syncKey = current ? `${current.track.artist}|${current.track.title}` : '';
  const sessionId = radio.session?.id;
  const sessionStatus = radio.session?.status;
  const syncedKey = useRef('');

  useEffect(() => {
    if (!current || !sessionId || sessionStatus !== 'live' || !syncKey) return;
    // one capture per song: the session object is refreshed by every poll
    const key = `${sessionId}|${syncKey}|${syncEpoch}`;
    if (syncedKey.current === key) return;
    syncedKey.current = key;

    const id = requestId.current;
    const track = current.track;
    let cancelled = false;

    /** the player runs behind the live edge: that gap is what we must wait out */
    const bufferedAhead = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || !audio.buffered.length) return 0;
      return Math.min(12, Math.max(0, audio.buffered.end(audio.buffered.length - 1) - audio.currentTime));
    };

    const capture = () =>
      syncRadio(sessionId)
      .then((result) => {
        if (cancelled || requestId.current !== id) return;
        if (result.status !== 'matched' || !result.track) return;
        const heard = result.track;

        // the player buffers a few seconds behind the live edge: the lyrics must
        // follow what the listener actually hears, not what the server received
        const audio = audioRef.current;
        let latency = 0;
        if (audio && !audio.paused && audio.buffered.length) {
          latency = audio.buffered.end(audio.buffered.length - 1) - audio.currentTime;
          latency = Math.min(12, Math.max(0, latency));
        }
        const position = Math.max(
          0,
          (result.offset ?? 0) + (Date.now() - result.capturedAt) / 1000 - latency,
        );

        // The station's metadata is the ground truth for *which* song plays;
        // Shazam only tells *where* we are. Swapping the stage on a mismatch
        // replaced whole songs with stale captures (the previous track), show
        // names or titles hidden inside a DJ mix: a song without lyrics is the
        // lesser annoyance, and the manual editor covers it.
        if (!sameSong(heard, track)) return;

        anchoredId.current = id;
        anchorClock(position);
        setAutoSynced(true);
      })
      .catch(() => undefined);

    // ICY metadata announces a song before the listener hears it: capturing
    // immediately recognises the end of the previous track. Wait for the
    // buffered gap, then listen inside the new song.
    const wait = Math.round(Math.max(0, bufferedAhead() + 2) * 1000);
    const timer = window.setTimeout(() => {
      if (!cancelled) void capture();
    }, wait);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // syncEpoch forces a new capture after a long pause: the stream may have
    // jumped back to the live edge while the lyrics clock stayed put.
  }, [syncKey, sessionId, sessionStatus, current, load, syncEpoch, anchorClock]);

  const transport: Transport = {
    available: !!radio.url,
    playing: audioPlaying,
    volume,
    muted,
    toggle: () => void togglePlay(),
    setVolume: applyVolume,
    toggleMute,
  };
  const transportRef = useRef(transport);
  transportRef.current = transport;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const controls = transportRef.current;
      if (event.key === ' ') {
        event.preventDefault();
        controls.toggle();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        controls.setVolume(controls.volume + 0.05);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        controls.setVolume(controls.volume - 0.05);
      }
      if (event.key.toLowerCase() === 'm') controls.toggleMute();
      if (event.key === 'ArrowLeft') bumpShift(3);
      if (event.key === 'ArrowRight') bumpShift(-3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, bumpShift]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">♪</span>
          <div>
            <h1>Sing Along</h1>
            <p>Paroles anglaises + traduction française, en direct</p>
          </div>
        </div>
        {!current && (
          <nav className="tabs">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? 'tab active' : 'tab'}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {current ? (
        <KaraokeStage
          track={current.track}
          payload={payload}
          clock={clock}
          loading={loading}
          error={error}
          autoSynced={autoSynced}
          shift={shift}
          onShift={bumpShift}
          onTapLine={tapLine}
          transport={transport}
          onBack={back}
          onRetry={() => void load(current.track, current.startAt)}
          onSaveLyrics={(raw) => void saveLyrics(raw)}
        />
      ) : (
        <main className="hero">
          <div className="hero-copy">
            <h2>
              {INTRO[mode].title} <span>{INTRO[mode].highlight}</span>.
            </h2>
            <p>{INTRO[mode].text}</p>
          </div>

          {mode === 'mic' && <MicPanel onDetected={load} busy={loading} />}
          {mode === 'radio' && <RadioPanel radio={radio} onDetected={load} />}
          {mode === 'search' && <SearchPanel onDetected={load} />}
        </main>
      )}

      {radio.url && (
        <div className="radio-bar">
          <span className={`dot ${radio.session?.status ?? 'connecting'}`} />
          <span className="radio-bar-name">
            {radio.session?.artist ? `${radio.session.artist} — ${radio.session.title}` : radio.name}
          </span>
          <audio
            ref={audioRef}
            src={radio.url}
            autoPlay
            preload="none"
            onPlay={() => {
              setAudioPlaying(true);
              clockRef.current.resume();
              // after a long pause the stream may have jumped back to the live
              // edge while the lyrics clock stayed put: ask for a fresh anchor
              if (pausedAt.current && Date.now() - pausedAt.current > 10_000) {
                setSyncEpoch((value) => value + 1);
              }
              pausedAt.current = null;
            }}
            onPause={() => {
              setAudioPlaying(false);
              pausedAt.current = Date.now();
              clockRef.current.pause();
            }}
          />
          <button
            className="round small"
            type="button"
            onClick={() => void togglePlay()}
            aria-label={audioPlaying ? 'Pause' : 'Lecture'}
            title={audioPlaying ? 'Pause' : 'Lecture'}
          >
            {audioPlaying ? '❚❚' : '▶'}
          </button>
          <div className="volume">
            <button
              className="icon"
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Rétablir le son' : 'Couper le son'}
              title={muted ? 'Rétablir le son (M)' : 'Couper le son (M)'}
            >
              {muted || volume === 0 ? '🔇' : '🔈'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => applyVolume(Number(event.target.value))}
              aria-label="Volume"
            />
          </div>
          <button className="ghost" type="button" onClick={() => void radio.stop()}>
            Arrêter
          </button>
        </div>
      )}

      {!current && (
        <footer className="app-footer">
          Reconnaissance : Shazam (API non officielle, sans clé) · Paroles : LRCLIB · Traduction :
          OPUS-MT exécuté en local. Usage personnel — les paroles restent soumises au droit d'auteur.
        </footer>
      )}
    </div>
  );
}
