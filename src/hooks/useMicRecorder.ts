import { useCallback, useEffect, useRef, useState } from 'react';

const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

/** A permission prompt that nobody answers never settles: give up. */
const PERMISSION_TIMEOUT = 15_000;

function describe(err: unknown): string {
  const error = err as Error;
  if (error?.message === 'MIC_TIMEOUT') {
    return "Le navigateur n'a pas répondu à la demande de micro. Autorise-le puis réessaie.";
  }
  if (error?.name === 'NotAllowedError') return 'Accès au micro refusé. Autorise le micro dans le navigateur.';
  if (error?.name === 'NotFoundError') return 'Aucun micro détecté. Branche un micro puis réessaie.';
  if (error?.name === 'NotReadableError') return 'Le micro est déjà utilisé par une autre application.';
  return `Micro indisponible : ${error?.message || 'raison inconnue'}`;
}

export interface MicRecorder {
  recording: boolean;
  /** live peak while recording or testing the microphone (0 → 1) */
  level: number;
  /** loudest frame of the last clip, as RMS (0 → 1): a click cannot fake it */
  lastLevel: () => number;
  monitoring: boolean;
  /** label of the input reported by the browser */
  deviceLabel: string;
  error: string | null;
  record: (durationMs: number) => Promise<Blob | null>;
  startMonitor: () => Promise<void>;
  stopMonitor: () => void;
  cancel: () => void;
}

/**
 * Records short clips from the default microphone, and can monitor the input
 * live (level meter) without recording. Both share the same stream so a test
 * never steals the device from a running capture.
 */
export function useMicRecorder(): MicRecorder {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [monitoring, setMonitoring] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peakRef = useRef(0);
  const monitorRef = useRef({ raf: 0, ctx: null as AudioContext | null, active: false });

  const openStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    if (existing && existing.getAudioTracks().some((track) => track.readyState === 'live')) {
      setDeviceLabel(existing.getAudioTracks()[0]?.label ?? '');
      return existing;
    }
    let timedOut = false;
    const stream = await new Promise<MediaStream>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        timedOut = true;
        reject(new Error('MIC_TIMEOUT'));
      }, PERMISSION_TIMEOUT);
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
        })
        .then((granted) => {
          window.clearTimeout(timer);
          // the answer came too late: don't leave the microphone open
          if (timedOut) granted.getTracks().forEach((track) => track.stop());
          else resolve(granted);
        })
        .catch((err) => {
          window.clearTimeout(timer);
          reject(err);
        });
    });
    streamRef.current = stream;
    setDeviceLabel(stream.getAudioTracks()[0]?.label ?? '');
    return stream;
  }, []);

  /** Stops the capture device, unless the level meter still needs it. */
  const releaseStream = useCallback(() => {
    if (monitorRef.current.active) return;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopMonitor = useCallback(() => {
    const current = monitorRef.current;
    if (current.raf) cancelAnimationFrame(current.raf);
    if (current.ctx) void current.ctx.close();
    monitorRef.current = { raf: 0, ctx: null, active: false };
    setMonitoring(false);
    setLevel(0);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startMonitor = useCallback(async () => {
    if (monitorRef.current.active) return;
    setError(null);
    try {
      const stream = await openStream();
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      monitorRef.current = { raf: 0, ctx, active: true };
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
        setLevel(peak);
        monitorRef.current.raf = requestAnimationFrame(tick);
      };
      monitorRef.current.raf = requestAnimationFrame(tick);
      setMonitoring(true);
    } catch (err) {
      stopMonitor();
      setError(describe(err));
    }
  }, [openStream, stopMonitor]);

  const cancel = useCallback(() => {
    stopMonitor();
  }, [stopMonitor]);

  const record = useCallback(
    async (durationMs: number): Promise<Blob | null> => {
      setError(null);
      try {
        const stream = await openStream();
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        let raf = 0;
        // RMS per frame, not the max sample: a single click would otherwise read
        // as clipping and push the verdict to "ça sature".
        const loudest = { value: 0 };
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          let peak = 0;
          for (const value of data) {
            const v = (value - 128) / 128;
            sum += v * v;
            peak = Math.max(peak, Math.abs(v));
          }
          loudest.value = Math.max(loudest.value, Math.sqrt(sum / data.length));
          setLevel(peak);
          raf = requestAnimationFrame(tick);
        };
        tick();

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        const done = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        });

        setRecording(true);
        recorder.start();
        await new Promise((resolve) => window.setTimeout(resolve, durationMs));
        if (recorder.state !== 'inactive') recorder.stop();

        const blob = await done;
        cancelAnimationFrame(raf);
        peakRef.current = loudest.value;
        void ctx.close();
        setRecording(false);
        // keep the device open when the meter is running
        if (!monitorRef.current.active) setLevel(0);
        releaseStream();
        return blob;
      } catch (err) {
        setRecording(false);
        setLevel(0);
        setError(describe(err));
        return null;
      }
    },
    [openStream, releaseStream],
  );

  useEffect(
    () => () => {
      const current = monitorRef.current;
      if (current.raf) cancelAnimationFrame(current.raf);
      if (current.ctx) void current.ctx.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return {
    recording,
    level,
    lastLevel: () => peakRef.current,
    monitoring,
    deviceLabel,
    error,
    record,
    startMonitor,
    stopMonitor,
    cancel,
  };
}
