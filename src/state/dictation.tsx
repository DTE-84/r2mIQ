import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  applyFinalResult,
  cleanSpoken,
  markEngineRestart,
  newDictationSession,
  type DictationSession,
} from '../lib/transcript';
import { useRecordings } from './recordings';

/** Errors after which restarting the engine cannot help. */
const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
  'network',
]);
/** Engines stop on their own after silence or time limits; resume this many times in a row without hearing anything. */
const MAX_SILENT_RESTARTS = 30;
/** If the engine never confirms it stopped, finish up anyway. */
const STOP_FALLBACK_MS = 3000;

interface DictationContextValue {
  /** Recording currently being dictated into, if any. */
  activeId: string | null;
  /** Words heard but not yet final. */
  interim: string;
  /** Total duration of the active recording, including earlier takes. */
  elapsedMs: number;
  error: string | null;
  clearError: () => void;
  start: (recordingId: string) => Promise<void>;
  stop: () => void;
}

const DictationContext = createContext<DictationContextValue | null>(null);

export function DictationProvider({ children }: { children: React.ReactNode }) {
  const { get, update, recordings } = useRecordings();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const sessionRef = useRef<DictationSession>(newDictationSession());
  const userStoppedRef = useRef(false);
  const startingRef = useRef(false);
  const startedAtRef = useRef(0);
  const baseDurationRef = useRef(0);
  const silentRestartsRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startEngine = () =>
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
    });

  const finalize = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    update(id, { durationMs: baseDurationRef.current + (Date.now() - startedAtRef.current) });
    activeIdRef.current = null;
    setActiveId(null);
    setInterim('');
  }, [update]);

  const start = useCallback(
    async (recordingId: string) => {
      if (activeIdRef.current || startingRef.current) return;
      startingRef.current = true;
      setError(null);
      try {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!granted) {
          setError('Microphone permission is off. Enable it in Settings to record.');
          return;
        }
        activeIdRef.current = recordingId;
        sessionRef.current = newDictationSession();
        userStoppedRef.current = false;
        silentRestartsRef.current = 0;
        startedAtRef.current = Date.now();
        baseDurationRef.current = get(recordingId)?.durationMs ?? 0;
        setElapsedMs(baseDurationRef.current);
        setInterim('');
        setActiveId(recordingId);
        startEngine();
      } catch (err: any) {
        activeIdRef.current = null;
        setActiveId(null);
        setError(err?.message ?? 'Speech recognition is not available on this device.');
      } finally {
        startingRef.current = false;
      }
    },
    [get]
  );

  const stop = useCallback(() => {
    if (!activeIdRef.current) return;
    userStoppedRef.current = true;
    try {
      // stop() (not abort) so the engine delivers its last final result first.
      ExpoSpeechRecognitionModule.stop();
    } catch {
      finalize();
      return;
    }
    stopTimerRef.current = setTimeout(finalize, STOP_FALLBACK_MS);
  }, [finalize]);

  // Live duration counter.
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => {
      setElapsedMs(baseDurationRef.current + (Date.now() - startedAtRef.current));
    }, 500);
    return () => clearInterval(t);
  }, [activeId]);

  // Stop if the recording being dictated into is deleted.
  useEffect(() => {
    if (activeId && !recordings.some((r) => r.id === activeId)) stop();
  }, [recordings, activeId, stop]);

  useSpeechRecognitionEvent('result', (e) => {
    const id = activeIdRef.current;
    if (!id) return;
    silentRestartsRef.current = 0;
    const spoken = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      setInterim('');
      const doc = get(id)?.transcript ?? '';
      const next = applyFinalResult(sessionRef.current, doc, spoken);
      if (next !== doc) update(id, { transcript: next });
    } else {
      setInterim(cleanSpoken(spoken));
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!activeIdRef.current || !FATAL_ERRORS.has(e.error)) return;
    userStoppedRef.current = true;
    setError(e.message || `Recording stopped (${e.error}).`);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!activeIdRef.current) return;
    if (userStoppedRef.current || silentRestartsRef.current >= MAX_SILENT_RESTARTS) {
      finalize();
      return;
    }
    // The engine stopped by itself (silence, platform time limit). Keep recording.
    silentRestartsRef.current += 1;
    markEngineRestart(sessionRef.current);
    setInterim('');
    try {
      startEngine();
    } catch {
      finalize();
    }
  });

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ activeId, interim, elapsedMs, error, clearError, start, stop }),
    [activeId, interim, elapsedMs, error, clearError, start, stop]
  );

  return <DictationContext.Provider value={value}>{children}</DictationContext.Provider>;
}

export function useDictation() {
  const ctx = useContext(DictationContext);
  if (!ctx) throw new Error('useDictation must be used inside DictationProvider');
  return ctx;
}
