import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Recording {
  id: string;
  title: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
  /** Total time spent recording, across every time recording was resumed. */
  durationMs: number;
}

const STORAGE_KEY = 'r2miq_recordings_v1';
/** Documents saved by the earlier single-editor version (web only; native kept them in memory). */
const LEGACY_DOCS_KEY = 'r2miq_vault_documents_v1';
const LEGACY_STARTER_IDS = new Set(['doc-welcome-1', 'doc-voice-2']);
const SAVE_DELAY_MS = 400;

const newId = () => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const defaultTitle = (date = new Date()) =>
  `Recording · ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

async function loadRecordings(): Promise<Recording[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Recording[];
  }

  // First launch of this version: bring over documents from the old editor.
  const legacyRaw = await AsyncStorage.getItem(LEGACY_DOCS_KEY);
  if (!legacyRaw) return [];
  const legacy = JSON.parse(legacyRaw);
  if (!Array.isArray(legacy)) return [];
  return legacy
    .filter((d: any) => d && typeof d.content === 'string' && !LEGACY_STARTER_IDS.has(d.id))
    .map((d: any) => ({
      id: String(d.id ?? newId()),
      title: String(d.title || defaultTitle()),
      transcript: d.content,
      createdAt: d.updatedAt ?? new Date().toISOString(),
      updatedAt: d.updatedAt ?? new Date().toISOString(),
      durationMs: 0,
    }));
}

interface RecordingsContextValue {
  recordings: Recording[];
  loaded: boolean;
  get: (id: string) => Recording | undefined;
  create: () => Recording;
  update: (id: string, patch: Partial<Omit<Recording, 'id'>>) => void;
  remove: (id: string) => void;
  /** Synchronous read of the latest state, for event handlers between renders. */
  latest: () => Recording[];
}

const RecordingsContext = createContext<RecordingsContextValue | null>(null);

export function RecordingsProvider({ children }: { children: React.ReactNode }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<Recording[]>([]);

  const commit = useCallback((next: Recording[]) => {
    ref.current = next;
    setRecordings(next);
  }, []);

  useEffect(() => {
    loadRecordings()
      .catch(() => [] as Recording[])
      .then((list) => {
        // Anything created before loading finished (unlikely) is kept on top.
        commit([...ref.current, ...list.filter((r) => !ref.current.some((c) => c.id === r.id))]);
        setLoaded(true);
      });
  }, [commit]);

  // Persist after changes settle, so live dictation doesn't write on every word.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recordings)).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [recordings, loaded]);

  const get = useCallback((id: string) => ref.current.find((r) => r.id === id), []);

  const create = useCallback(() => {
    const now = new Date();
    const rec: Recording = {
      id: newId(),
      title: defaultTitle(now),
      transcript: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      durationMs: 0,
    };
    commit([rec, ...ref.current]);
    return rec;
  }, [commit]);

  const update = useCallback(
    (id: string, patch: Partial<Omit<Recording, 'id'>>) => {
      commit(
        ref.current.map((r) =>
          r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
        )
      );
    },
    [commit]
  );

  const remove = useCallback(
    (id: string) => commit(ref.current.filter((r) => r.id !== id)),
    [commit]
  );

  const latest = useCallback(() => ref.current, []);

  const value = useMemo(
    () => ({ recordings, loaded, get, create, update, remove, latest }),
    [recordings, loaded, get, create, update, remove, latest]
  );

  return <RecordingsContext.Provider value={value}>{children}</RecordingsContext.Provider>;
}

export function useRecordings() {
  const ctx = useContext(RecordingsContext);
  if (!ctx) throw new Error('useRecordings must be used inside RecordingsProvider');
  return ctx;
}
