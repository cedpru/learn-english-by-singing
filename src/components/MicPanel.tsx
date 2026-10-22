import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicRecorder } from '../hooks/useMicRecorder';
import { recognizeClip } from '../lib/api';
import type { SongRef } from '../lib/types';

interface Props {
  onDetected: (track: SongRef, startAt: number) => void;
  busy: boolean;
}

const CLIP_MS = 8000;
const MAX_ATTEMPTS = 6;

export function MicPanel({ onDetected, busy }: Props) {
  const mic = useMicRecorder();
  const [status, setStatus] = useState<string | null>(null);
  const [looping, setLooping] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testClip, setTestClip] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const loopRef = useRef(false);
  const clipRef = useRef<HTMLAudioElement | null>(null);
  const testRef = useRef<HTMLDivElement>(null);

  // Real countdown inside the button: the recording lasts CLIP_MS, so show what
  // is left instead of a fixed "8s".
  useEffect(() => {
    if (!mic.recording) {
      setRemaining(0);
      return;
    }
    const deadline = performance.now() + CLIP_MS;
    setRemaining(Math.ceil(CLIP_MS / 1000));
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
    }, 100);
    return () => window.clearInterval(id);
  }, [mic.recording]);

  const attempt = async (index: number): Promise<boolean> => {
    const startedAt = Date.now();
    setStatus(index === 0 ? 'Écoute… reste près de la source sonore.' : `Écoute ${index + 1}/${MAX_ATTEMPTS}…`);
    const blob = await mic.record(CLIP_MS);
    if (!blob) {
      // the recorder already surfaced the reason (permission, no device…)
      setStatus(null);
      return true;
    }
    if (blob.size < 2000) {
      setStatus("Rien capté. Vérifie que le micro n'est pas coupé.");
      return true;
    }
    // A silent clip is still a few dozen kilobytes: ask the recorder how loud it
    // actually was instead of sending room noise to Shazam.
    if (mic.lastLevel() < 0.01) {
      setStatus(
        "Le micro n'entend presque rien. Monte le volume de la source, rapproche le micro, ou vérifie le niveau d'entrée dans Windows.",
      );
      return true;
    }
    setStatus('Identification en cours…');
    let res: Awaited<ReturnType<typeof recognizeClip>>;
    try {
      res = await recognizeClip(blob);
    } catch (err) {
      // the server refused the clip: retrying the same request changes nothing
      setStatus(`Reconnaissance impossible : ${(err as Error).message}`);
      return true;
    }
    if (res.status !== 'matched' || !res.track) {
      setStatus('Morceau non reconnu. Monte un peu le volume et réessaie.');
      return false;
    }
    const offset = res.track.offset ?? 0;
    const startAt = offset + (Date.now() - startedAt) / 1000;
    setStatus(`Trouvé : ${res.track.artist} — ${res.track.title}`);
    onDetected(res.track, startAt);
    return true;
  };

  const listen = async (loop: boolean) => {
    loopRef.current = loop;
    setLooping(loop);
    try {
      for (let i = 0; i < (loop ? MAX_ATTEMPTS : 1); i += 1) {
        const done = await attempt(i);
        if (done || !loopRef.current) break;
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
    } finally {
      // never leave the button disabled if something unexpected throws
      setLooping(false);
      loopRef.current = false;
    }
  };

  const active = mic.recording || looping;
  const levelScale = 1 + Math.min(1, mic.level * 3) * 0.35;

  const stopTest = useCallback(() => {
    setTesting(false);
    setTestStatus(null);
    clipRef.current?.pause();
    setTestClip((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    mic.stopMonitor();
  }, [mic]);

  useEffect(() => () => {
    clipRef.current?.pause();
  }, []);

  // The test block opens below the fold: bring it into view.
  useEffect(() => {
    if (testing) testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [testing]);

  /** Records three seconds and plays them back: the fastest way to check the device. */
  const checkDevice = async () => {
    setTestStatus('Enregistrement 3 s…');
    const blob = await mic.record(3000);
    if (!blob) {
      setTestStatus(null);
      return;
    }
    const loudness = mic.lastLevel();
    setTestClip((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(blob);
    });
    // The browser's automatic gain control lifts a silent room to a comfortable
    // level, so no absolute level can promise "good": the replay is the proof.
    setTestStatus(
      loudness < 0.005
        ? 'Rien capté. Micro coupé, mauvais périphérique, ou niveau d’entrée à zéro.'
        : loudness < 0.02
          ? 'Signal très faible : rapproche le micro ou monte le volume de la source.'
          : 'Du son arrive dans le micro — réécoute pour vérifier que c’est bien la musique.',
    );
  };

  return (
    <div className="panel">
      <div className="mic-stage">
        <button
          type="button"
          className={`mic-button ${active ? 'active' : ''}`}
          style={active ? { transform: `scale(${levelScale})` } : undefined}
          onClick={() => !active && !busy && void listen(false)}
          disabled={active || busy}
          aria-label="Identifier le morceau qui passe"
        >
          {mic.recording ? <span className="countdown">{remaining}s</span> : '🎤'}
        </button>
        <p className="panel-lead">
          Appuie, puis laisse le micro écouter le morceau qui passe à la radio, à la télé ou sur
          ton enceinte pendant 8 secondes.
        </p>
        <div className="row">
          <button
            className="primary"
            type="button"
            disabled={active || busy}
            onClick={() => void listen(true)}
          >
            {active ? 'Écoute en cours…' : 'Écouter en continu'}
          </button>
          <button className="ghost" type="button" disabled={active} onClick={() => void listen(false)}>
            Une seule écoute
          </button>
        </div>
        {status && <p className="status">{status}</p>}
        {mic.error && <p className="error">{mic.error}</p>}

        <button
          className="ghost test-toggle"
          type="button"
          disabled={active}
          onClick={() => {
            if (testing) {
              stopTest();
            } else {
              setTesting(true);
              setTestStatus('Micro ouvert : parle ou mets la musique pour voir le niveau.');
              void mic.startMonitor();
            }
          }}
        >
          {testing ? 'Fermer le test micro' : '🎚 Tester le micro'}
        </button>

        {testing && (
          <div className="mic-test" ref={testRef}>
            <div className="meter" role="img" aria-label={`Niveau du micro ${Math.round(mic.level * 100)} %`}>
              <div
                className={`meter-fill ${mic.level > 0.9 ? 'hot' : mic.level < 0.08 ? 'low' : ''}`}
                style={{ width: `${Math.min(100, mic.level * 140)}%` }}
              />
            </div>
            <p className="meter-caption">
              {mic.deviceLabel ? `Entrée : ${mic.deviceLabel}` : 'Ouverture du micro…'} ·{' '}
              {Math.round(mic.level * 100)} %
            </p>
            {testStatus && <p className="status">{testStatus}</p>}
            <div className="row">
              <button className="primary" type="button" onClick={() => void checkDevice()} disabled={mic.recording}>
                {mic.recording ? 'Enregistrement…' : 'Enregistrer 3 s'}
              </button>
              {testClip && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    clipRef.current?.pause();
                    const audio = new Audio(testClip);
                    clipRef.current = audio;
                    void audio.play();
                  }}
                >
                  ▶ Réécouter
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
