import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  SafeAreaView,
  Pressable,
  Animated,
  ScrollView,
  Platform,
  Modal,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  DocCategory,
  PlanTier,
  TIER_SPECS,
  SavedDocument,
  GoogleUser,
  fetchDocumentsFromNeon,
  upsertDocumentInNeon,
  toggleDocumentQueueInNeon,
  deleteDocumentFromNeon,
  upsertUserInNeon,
  updateUserTierAndUsageInNeon,
} from './neonDb';

// ---------- Types ----------
type StudioMode = 'read' | 'dictate' | 'transcribe';
type NeonSyncStatus = 'connecting' | 'synced' | 'syncing' | 'local-fallback';

interface VoiceProfile {
  identifier: string;
  name: string;
  language: string;
  isPremium?: boolean;
  pitchPreset?: number;
  rateMultiplier?: number;
  tag?: string;
}

// ---------- Premium Natural Voice Profiles (Pro & RunIQ Bundle) ----------
const PREMIUM_NATURAL_VOICES: VoiceProfile[] = [
  {
    identifier: 'premium-nova-neural',
    name: 'Nova Neural — Warm Executive',
    language: 'en-US',
    isPremium: true,
    pitchPreset: 1.04,
    rateMultiplier: 1.02,
    tag: 'PRO NATURAL',
  },
  {
    identifier: 'premium-orion-neural',
    name: 'Orion Neural — Deep Broadcast',
    language: 'en-US',
    isPremium: true,
    pitchPreset: 0.9,
    rateMultiplier: 0.98,
    tag: 'PRO NATURAL',
  },
  {
    identifier: 'premium-aria-neural',
    name: 'Aria Neural — Crisp Narrator',
    language: 'en-GB',
    isPremium: true,
    pitchPreset: 1.08,
    rateMultiplier: 1.0,
    tag: 'PRO NATURAL',
  },
  {
    identifier: 'premium-vega-driver',
    name: 'Vega Road — High-Clarity Driver',
    language: 'en-US',
    isPremium: true,
    pitchPreset: 1.0,
    rateMultiplier: 1.08,
    tag: 'RUNIQ TUNED',
  },
];

// ---------- Local Cache Fallback Helpers ----------
const DOCS_STORAGE_KEY = 'r2miq_studio_docs_v3';
const USER_STORAGE_KEY = 'r2miq_google_user_v3';
const CLIENT_ID_STORAGE_KEY = 'r2miq_google_client_id_v3';
const DAILY_USAGE_STORAGE_KEY = 'r2miq_daily_usage_v3';
const TIER_STORAGE_KEY = 'r2miq_plan_tier_v3';

const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return memoryStore[key] ?? null;
  } catch {
    return memoryStore[key] ?? null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    memoryStore[key] = value;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors
  }
}

function storageRemove(key: string): void {
  try {
    delete memoryStore[key];
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore errors
  }
}

// ---------- Starter Vault Documents ----------
const INITIAL_DOCS: SavedDocument[] = [
  {
    id: 'doc-1',
    title: 'Pocket Voice Studio — Welcome Script',
    content:
      'Welcome to r2mIQ, your pocket voice studio. Switch seamlessly between natural device voice synthesis, hands-free live dictation, and instant audio file transcription — all synchronized to your personal Neon Postgres vault.',
    category: 'Read Aloud',
    updatedAt: new Date().toISOString(),
    wordCount: 32,
    inQueue: true,
    queueOrder: 1,
  },
  {
    id: 'doc-2',
    title: 'Hands-Free Executive Voice Memo',
    content:
      'Action items for Q4 product launch: finalize mobile PWA manifest, verify natural voice cadence across desktop and mobile browsers, and archive meeting transcripts directly to Neon Postgres.',
    category: 'Live Dictation',
    updatedAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
    wordCount: 27,
    inQueue: true,
    queueOrder: 2,
  },
];

// ---------- Multi-Color Google "G" Badge ----------
const GoogleGIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <View
    style={[
      styles.googleGCircle,
      { width: size, height: size, borderRadius: size / 2 },
    ]}
  >
    <Text style={[styles.googleGText, { fontSize: size * 0.64 }]}>G</Text>
  </View>
);

// ---------- Live Animated Soundwave Visualizer ----------
const SoundwaveVisualizer: React.FC<{ active: boolean; accentColor?: string }> = ({
  active,
  accentColor = '#00E5B0',
}) => {
  const bars = useMemo(
    () => [0.35, 0.7, 0.5, 0.95, 0.6, 0.85, 0.4, 0.9, 0.55, 0.75, 0.45, 0.65],
    []
  );
  const animValues = useRef(bars.map((v) => new Animated.Value(v))).current;

  useEffect(() => {
    if (active) {
      const animations = animValues.map((val, idx) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(val, {
              toValue: 0.25 + ((idx * 19) % 75) / 100,
              duration: 240 + idx * 35,
              useNativeDriver: false,
            }),
            Animated.timing(val, {
              toValue: 0.95 - ((idx * 13) % 60) / 100,
              duration: 260 + idx * 30,
              useNativeDriver: false,
            }),
          ])
        )
      );
      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    } else {
      animValues.forEach((val, idx) => {
        val.setValue(0.22 + (idx % 3) * 0.08);
      });
    }
  }, [active, animValues]);

  return (
    <View style={styles.waveformRow}>
      {animValues.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveformBar,
            {
              backgroundColor: active ? accentColor : '#27303F',
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 24],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

// ---------- Main Application ----------
export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 720;

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Subscription Tier & Daily Quota State
  const [planTier, setPlanTier] = useState<PlanTier>('free');
  const [dailyCharsUsed, setDailyCharsUsed] = useState<number>(0);
  const [driverModeActive, setDriverModeActive] = useState<boolean>(false);
  const currentTierSpec = TIER_SPECS[planTier];

  // Active Mode & Document State
  const [mode, setMode] = useState<StudioMode>('read');
  const [activeDocId, setActiveDocId] = useState<string | null>('doc-1');
  const [docTitle, setDocTitle] = useState<string>(INITIAL_DOCS[0].title);
  const [text, setText] = useState<string>(INITIAL_DOCS[0].content);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [documents, setDocuments] = useState<SavedDocument[]>(INITIAL_DOCS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [neonStatus, setNeonStatus] = useState<NeonSyncStatus>('connecting');

  // Voice Synthesis (Read Aloud & Queue) State
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [playingQueue, setPlayingQueue] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [speechPitch] = useState<number>(1.0);
  const [browserVoices, setBrowserVoices] = useState<VoiceProfile[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');

  // Live Dictation State
  const [recording, setRecording] = useState<boolean>(false);
  const [continuousMode] = useState<boolean>(true);

  // Audio-to-Text File State
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<string | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState<boolean>(false);

  // Modals & Notifications
  const [vaultModalVisible, setVaultModalVisible] = useState<boolean>(false);
  const [queueModalVisible, setQueueModalVisible] = useState<boolean>(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState<boolean>(false);
  const [pricingModalVisible, setPricingModalVisible] = useState<boolean>(false);
  const [authModalVisible, setAuthModalVisible] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Google Auth State
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>(
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || ''
  );
  const [customNameInput, setCustomNameInput] = useState<string>('Drew (DTE Solutions)');
  const [customEmailInput, setCustomEmailInput] = useState<string>('drew@dte-solutions.icu');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  // Load Documents from Neon Postgres
  const refreshDocsFromNeon = async (ownerEmail?: string) => {
    setNeonStatus('syncing');
    try {
      const remoteDocs = await fetchDocumentsFromNeon(ownerEmail);
      if (remoteDocs.length > 0) {
        setDocuments(remoteDocs);
        storageSet(DOCS_STORAGE_KEY, JSON.stringify(remoteDocs));
        setActiveDocId((prevId) => {
          const match = remoteDocs.find((d) => d.id === prevId) || remoteDocs[0];
          setDocTitle(match.title);
          setText(match.content);
          return match.id;
        });
      }
      setNeonStatus('synced');
    } catch {
      setNeonStatus('local-fallback');
    }
  };

  // Hydrate Vault, Auth, Tier, Daily Usage, and Device Voices
  useEffect(() => {
    // Hydrate local daily usage
    const todayKey = new Date().toISOString().slice(0, 10);
    const savedUsageRaw = storageGet(DAILY_USAGE_STORAGE_KEY);
    if (savedUsageRaw) {
      try {
        const parsedUsage = JSON.parse(savedUsageRaw);
        if (parsedUsage.date === todayKey) {
          setDailyCharsUsed(Number(parsedUsage.chars || 0));
        }
      } catch {
        // Ignore
      }
    }

    const savedTier = storageGet(TIER_STORAGE_KEY) as PlanTier | null;
    if (savedTier && TIER_SPECS[savedTier]) {
      setPlanTier(savedTier);
    }

    let parsedUser: GoogleUser | null = null;
    const rawUser = storageGet(USER_STORAGE_KEY);
    if (rawUser) {
      try {
        parsedUser = JSON.parse(rawUser);
        setUser(parsedUser);
        if (parsedUser?.planTier && TIER_SPECS[parsedUser.planTier]) {
          setPlanTier(parsedUser.planTier);
        }
      } catch {
        // Ignore invalid JSON
      }
    }

    const rawDocs = storageGet(DOCS_STORAGE_KEY);
    if (rawDocs) {
      try {
        const parsed = JSON.parse(rawDocs) as SavedDocument[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDocuments(parsed);
          setActiveDocId(parsed[0].id);
          setDocTitle(parsed[0].title);
          setText(parsed[0].content);
        }
      } catch {
        // Fallback to starter docs
      }
    }

    refreshDocsFromNeon(parsedUser?.email);

    const savedClientId = storageGet(CLIENT_ID_STORAGE_KEY);
    if (savedClientId) {
      setGoogleClientId(savedClientId);
    }

    // Load available browser/device voices (Free Tier $0 cost voices)
    const loadVoices = async () => {
      try {
        const avail = await Speech.getAvailableVoicesAsync();
        if (avail && avail.length > 0) {
          const formatted: VoiceProfile[] = avail.slice(0, 25).map((v) => ({
            identifier: v.identifier,
            name: v.name || v.identifier,
            language: v.language || 'en-US',
            isPremium: false,
            tag: 'FREE BROWSER',
          }));
          setBrowserVoices(formatted);
          const defaultEn = formatted.find((v) => v.language.startsWith('en')) || formatted[0];
          if (defaultEn) setSelectedVoiceId(defaultEn.identifier);
        }
      } catch {
        // Fallback if browser hasn't populated voices yet
      }
    };
    loadVoices();

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
    }

    // Check OAuth Redirect Hash (#access_token=...)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((res) => res.json())
          .then(async (profile) => {
            if (profile && profile.email) {
              const googleProfile: GoogleUser = {
                id: profile.sub || `g-${Date.now()}`,
                name: profile.name || profile.email.split('@')[0],
                email: profile.email,
                picture: profile.picture,
                provider: 'google-oauth',
                planTier,
                dailyCharsUsed,
              };
              setUser(googleProfile);
              storageSet(USER_STORAGE_KEY, JSON.stringify(googleProfile));
              try {
                const synced = await upsertUserInNeon(
                  googleProfile,
                  selectedVoiceId,
                  speechRate
                );
                setPlanTier(synced.planTier);
                setDailyCharsUsed(synced.dailyCharsUsed);
                await refreshDocsFromNeon(googleProfile.email);
              } catch {
                // Keep local session
              }
              showToast(`Connected to Google & Neon as ${googleProfile.email}`);
            }
          })
          .catch(() => {
            setErrorMsg('Could not verify Google OAuth session token.');
          });
      }
    }
  }, []);

  // ---------- Computed Metrics & Queue ----------
  const metrics = useMemo(() => {
    const clean = text.trim();
    const words = clean ? clean.split(/\s+/).length : 0;
    const chars = text.length;
    const estSeconds = Math.max(0, Math.round((words / (155 * speechRate)) * 60));
    const duration =
      words === 0
        ? '0:00'
        : `${Math.floor(estSeconds / 60)}:${String(estSeconds % 60).padStart(2, '0')}`;
    return { words, chars, duration };
  }, [text, speechRate]);

  const queuedDocs = useMemo(
    () =>
      documents
        .filter((d) => d.inQueue)
        .sort((a, b) => (a.queueOrder || 0) - (b.queueOrder || 0)),
    [documents]
  );

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  const allVoices = useMemo(
    () => [...PREMIUM_NATURAL_VOICES, ...browserVoices],
    [browserVoices]
  );

  const activeVoiceProfile = useMemo(() => {
    return (
      allVoices.find((v) => v.identifier === selectedVoiceId) || {
        identifier: '',
        name: 'Browser Default Voice',
        language: 'en-US',
        isPremium: false,
        tag: 'FREE BROWSER',
      }
    );
  }, [allVoices, selectedVoiceId]);

  const quotaPercentage = Math.min(
    100,
    Math.round((dailyCharsUsed / currentTierSpec.dailyCharLimit) * 100)
  );

  // ---------- Mode Switching ----------
  const handleSelectMode = (nextMode: StudioMode) => {
    setErrorMsg(null);
    setMode(nextMode);
  };

  // ---------- Helper: Record Character Consumption ----------
  const recordCharacterUsage = async (charsToAdd: number): Promise<boolean> => {
    const nextTotal = dailyCharsUsed + charsToAdd;
    if (nextTotal > currentTierSpec.dailyCharLimit) {
      setErrorMsg(
        `Daily ${currentTierSpec.name} limit reached (${currentTierSpec.dailyCharLimit.toLocaleString()} chars/day). Upgrade to Pro or RunIQ Bundle for higher limits.`
      );
      setPricingModalVisible(true);
      return false;
    }

    setDailyCharsUsed(nextTotal);
    const todayKey = new Date().toISOString().slice(0, 10);
    storageSet(
      DAILY_USAGE_STORAGE_KEY,
      JSON.stringify({ date: todayKey, chars: nextTotal })
    );

    if (user?.email) {
      try {
        await updateUserTierAndUsageInNeon(user.email, planTier, nextTotal);
      } catch {
        // Ignore network hiccup
      }
    }
    return true;
  };

  // ---------- Tier Upgrade / Switch Handler ----------
  const handleSelectPlanTier = async (nextTier: PlanTier) => {
    setPlanTier(nextTier);
    storageSet(TIER_STORAGE_KEY, nextTier);
    if (nextTier !== 'runiq_bundle') {
      setDriverModeActive(false);
    }
    if (nextTier === 'free' && activeVoiceProfile.isPremium) {
      const firstFree = browserVoices[0];
      setSelectedVoiceId(firstFree ? firstFree.identifier : '');
    } else if (nextTier !== 'free' && !activeVoiceProfile.isPremium) {
      setSelectedVoiceId(PREMIUM_NATURAL_VOICES[0].identifier);
    }

    if (user) {
      const updatedUser: GoogleUser = { ...user, planTier: nextTier };
      setUser(updatedUser);
      storageSet(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      try {
        await updateUserTierAndUsageInNeon(user.email, nextTier, dailyCharsUsed);
      } catch {
        // Ignore
      }
    }

    setPricingModalVisible(false);
    showToast(`Activated ${TIER_SPECS[nextTier].name} (${TIER_SPECS[nextTier].priceLabel})`);
  };

  // ---------- 1. Read Aloud (Single Document or Saved Queue) ----------
  const speakTextContent = async (
    contentToSpeak: string,
    onFinishedCallback?: () => void
  ) => {
    setErrorMsg(null);
    const clean = contentToSpeak.trim();
    if (!clean) {
      setErrorMsg('Type or paste some text first so r2mIQ can read it aloud.');
      return;
    }

    const allowed = await recordCharacterUsage(clean.length);
    if (!allowed) return;

    if (recording) stopRecording();
    Speech.stop();
    setSpeaking(true);

    // Resolve voice profile parameters (Premium Neural profiles apply tuned cadence & pitch)
    const isPremiumProfile = Boolean(activeVoiceProfile.isPremium);
    const underlyingBrowserVoice = isPremiumProfile
      ? browserVoices.find((v) => v.language.startsWith('en'))?.identifier
      : selectedVoiceId || undefined;

    const effectivePitch = activeVoiceProfile.pitchPreset ?? speechPitch;
    const effectiveRate =
      speechRate * (activeVoiceProfile.rateMultiplier ?? 1.0);

    Speech.speak(clean, {
      language: activeVoiceProfile.language || 'en-US',
      rate: effectiveRate,
      pitch: effectivePitch,
      voice: underlyingBrowserVoice,
      onDone: () => {
        setSpeaking(false);
        if (onFinishedCallback) onFinishedCallback();
      },
      onStopped: () => {
        setSpeaking(false);
        setPlayingQueue(false);
      },
      onError: () => {
        setSpeaking(false);
        setPlayingQueue(false);
        setErrorMsg('Voice playback interrupted.');
      },
    });
  };

  const handleSpeak = () => {
    setPlayingQueue(false);
    speakTextContent(text);
  };

  const handleStopSpeaking = () => {
    Speech.stop();
    setSpeaking(false);
    setPlayingQueue(false);
  };

  // Play Saved Listening Queue Sequentially (Pro & RunIQ Bundle Feature)
  const playQueueFromIndex = (index: number) => {
    if (!currentTierSpec.savedQueue) {
      setPricingModalVisible(true);
      showToast('Saved Listening Queue is a Pro / RunIQ Bundle feature');
      return;
    }
    if (queuedDocs.length === 0) {
      setErrorMsg('Your Saved Queue is empty. Add documents from the Vault or studio.');
      return;
    }
    if (index >= queuedDocs.length) {
      setPlayingQueue(false);
      showToast('Finished playing Saved Listening Queue');
      return;
    }

    const targetDoc = queuedDocs[index];
    setPlayingQueue(true);
    setActiveDocId(targetDoc.id);
    setDocTitle(targetDoc.title);
    setText(targetDoc.content);
    showToast(`Playing Queue (${index + 1}/${queuedDocs.length}): ${targetDoc.title}`);

    speakTextContent(targetDoc.content, () => {
      playQueueFromIndex(index + 1);
    });
  };

  const handleToggleCurrentDocInQueue = async () => {
    if (!currentTierSpec.savedQueue) {
      setPricingModalVisible(true);
      return;
    }
    if (!activeDocId) {
      await handleSaveToVault(false, true);
      return;
    }
    const existing = documents.find((d) => d.id === activeDocId);
    if (!existing) return;

    const nextInQueue = !existing.inQueue;
    const nextOrder = nextInQueue ? queuedDocs.length + 1 : 0;
    const updatedDocs = documents.map((d) =>
      d.id === activeDocId ? { ...d, inQueue: nextInQueue, queueOrder: nextOrder } : d
    );
    setDocuments(updatedDocs);
    storageSet(DOCS_STORAGE_KEY, JSON.stringify(updatedDocs));

    try {
      await toggleDocumentQueueInNeon(activeDocId, nextInQueue, nextOrder);
    } catch {
      // Fallback local
    }
    showToast(
      nextInQueue
        ? `Added "${existing.title}" to Saved Queue`
        : `Removed "${existing.title}" from Saved Queue`
    );
  };

  // ---------- 2. Live Dictation (Speech-to-Text) ----------
  const startRecording = async () => {
    setErrorMsg(null);
    if (speaking) handleStopSpeaking();
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setErrorMsg('Microphone permission was denied. Allow mic access in your browser bar.');
        return;
      }
      setInterimTranscript('');
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: continuousMode,
      });
      setRecording(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Speech recognition is not supported in this browser.');
    }
  };

  const stopRecording = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore stop errors
    }
    setRecording(false);
    setInterimTranscript('');
    setIsTranscribingAudio(false);
  };

  useSpeechRecognitionEvent('result', (e) => {
    const spoken = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      setInterimTranscript('');
      if (spoken.trim()) {
        recordCharacterUsage(spoken.trim().length);
        setText((prev) => {
          const base = prev.trimEnd();
          return base ? `${base} ${spoken.trim()}` : spoken.trim();
        });
      }
    } else {
      setInterimTranscript(spoken);
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    setRecording(false);
    setIsTranscribingAudio(false);
    setInterimTranscript('');
    setErrorMsg(e.message || `Speech recognition error (${e.error})`);
  });

  useSpeechRecognitionEvent('end', () => {
    setRecording(false);
    setIsTranscribingAudio(false);
    setInterimTranscript('');
  });

  // ---------- 3. Audio-to-Text & Document Dropzone ----------
  const handlePickAudioOrDocFile = () => {
    setErrorMsg(null);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.wav,.m4a,.webm,.ogg,.txt,.md,.srt';
      input.onchange = (event: any) => {
        const file = event?.target?.files?.[0];
        if (!file) return;

        const sizeKB = (file.size / 1024).toFixed(1);
        setUploadedFileName(file.name);
        setUploadedFileSize(`${sizeKB} KB`);
        const baseTitle = file.name.replace(/\.[^/.]+$/, '');
        setDocTitle(baseTitle);

        if (
          file.type.startsWith('text/') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.md') ||
          file.name.endsWith('.srt')
        ) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = String(e.target?.result ?? '');
            setText(content);
            showToast(`Loaded "${file.name}" into studio`);
          };
          reader.readAsText(file);
          return;
        }

        if (uploadedAudioUrl) {
          URL.revokeObjectURL(uploadedAudioUrl);
        }
        const objectUrl = URL.createObjectURL(file);
        setUploadedAudioUrl(objectUrl);
        setIsTranscribingAudio(true);

        const timestamp = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        setText((prev) => {
          const header = `[Audio Recording Imported: ${file.name} (${sizeKB} KB) • ${timestamp}]\n`;
          return prev.trim() ? `${prev.trim()}\n\n${header}` : header;
        });

        startRecording();
        showToast(`Audio "${file.name}" loaded — transcribing live audio`);
      };
      input.click();
    } else {
      showToast('File dropzone is active on Web.');
    }
  };

  // ---------- Neon Postgres Vault Save / Delete / Export ----------
  const modeToCategory = (m: StudioMode): DocCategory =>
    m === 'read' ? 'Read Aloud' : m === 'dictate' ? 'Live Dictation' : 'Audio Transcript';

  const handleSaveToVault = async (asNew = false, addToQueue = false) => {
    const isCreatingNew =
      asNew || !activeDocId || !documents.some((d) => d.id === activeDocId);

    if (isCreatingNew && documents.length >= currentTierSpec.maxVaultDocs) {
      setErrorMsg(
        `Free tier Vault holds up to ${currentTierSpec.maxVaultDocs} documents. Upgrade to Pro for unlimited Neon Vault storage & Saved Queue.`
      );
      setPricingModalVisible(true);
      return;
    }

    const cleanTitle =
      docTitle.trim() ||
      `Studio Session (${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })})`;

    const category = modeToCategory(mode);
    const nowIso = new Date().toISOString();

    const targetId = !isCreatingNew && activeDocId ? activeDocId : `doc-${Date.now()}`;
    const existingDoc = documents.find((d) => d.id === targetId);

    const docToSave: SavedDocument = {
      id: targetId,
      title: cleanTitle,
      content: text,
      category,
      updatedAt: nowIso,
      wordCount: metrics.words,
      durationLabel: metrics.duration,
      ownerEmail: user?.email,
      inQueue: addToQueue ? true : existingDoc?.inQueue ?? false,
      queueOrder: addToQueue
        ? queuedDocs.length + 1
        : existingDoc?.queueOrder ?? 0,
    };

    const nextDocs = documents.some((d) => d.id === targetId)
      ? documents.map((d) => (d.id === targetId ? docToSave : d))
      : [docToSave, ...documents];

    setDocuments(nextDocs);
    storageSet(DOCS_STORAGE_KEY, JSON.stringify(nextDocs));
    setActiveDocId(targetId);
    setDocTitle(cleanTitle);

    setNeonStatus('syncing');
    try {
      await upsertDocumentInNeon(docToSave);
      setNeonStatus('synced');
      showToast(
        addToQueue
          ? `Saved & queued "${cleanTitle}" in Neon`
          : `Saved "${cleanTitle}" to Neon Postgres`
      );
    } catch {
      setNeonStatus('local-fallback');
      showToast(`Saved "${cleanTitle}" to local cache`);
    }
  };

  const handleDeleteSavedDoc = async (id: string) => {
    const next = documents.filter((d) => d.id !== id);
    setDocuments(next);
    storageSet(DOCS_STORAGE_KEY, JSON.stringify(next));
    if (activeDocId === id) {
      setActiveDocId(next[0]?.id ?? null);
    }

    setNeonStatus('syncing');
    try {
      await deleteDocumentFromNeon(id);
      setNeonStatus('synced');
      showToast('Deleted document from Neon Postgres');
    } catch {
      setNeonStatus('local-fallback');
      showToast('Removed document from local Vault');
    }
  };

  const handleExportFile = (ext: 'txt' | 'md') => {
    const safeName = (docTitle.trim() || 'r2mIQ-transcript')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-');
    const filename = `${safeName}.${ext}`;
    const payload =
      ext === 'md'
        ? `# ${docTitle || 'r2mIQ Studio Transcript'}\n\n- **Mode:** ${modeToCategory(
            mode
          )}\n- **Tier:** ${currentTierSpec.name}\n- **Words:** ${metrics.words} (${
            metrics.duration
          } audio)\n- **Exported:** ${new Date().toLocaleString()}\n${
            user ? `- **Account:** ${user.name} (${user.email})\n` : ''
          }\n---\n\n${text}\n`
        : text;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}`);
    } else {
      handleSaveToVault(false);
    }
  };

  const handleCopyText = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Copied transcript to clipboard');
      }
    } catch {
      setErrorMsg('Clipboard permission denied by browser.');
    }
  };

  const handleOpenSavedDoc = (doc: SavedDocument) => {
    if (recording) stopRecording();
    if (speaking) handleStopSpeaking();
    setActiveDocId(doc.id);
    setDocTitle(doc.title);
    setText(doc.content);
    if (doc.category === 'Read Aloud') setMode('read');
    else if (doc.category === 'Live Dictation') setMode('dictate');
    else setMode('transcribe');
    setVaultModalVisible(false);
    setQueueModalVisible(false);
    showToast(`Opened "${doc.title}"`);
  };

  // ---------- Google Authentication + Neon User Sync ----------
  const handleQuickGoogleSignIn = async () => {
    const email = customEmailInput.trim() || 'drew@dte-solutions.icu';
    const name = customNameInput.trim() || 'Drew (DTE Solutions)';
    const nextUser: GoogleUser = {
      id: `g-${Date.now()}`,
      name,
      email,
      provider: 'google-workspace',
      planTier,
      dailyCharsUsed,
    };
    setUser(nextUser);
    storageSet(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthModalVisible(false);

    setNeonStatus('syncing');
    try {
      const synced = await upsertUserInNeon(nextUser, selectedVoiceId, speechRate);
      setPlanTier(synced.planTier);
      setDailyCharsUsed(synced.dailyCharsUsed);
      await refreshDocsFromNeon(nextUser.email);
      setNeonStatus('synced');
      showToast(`Signed in & synced Neon Vault for ${nextUser.email}`);
    } catch {
      setNeonStatus('local-fallback');
      showToast(`Signed in as ${nextUser.email}`);
    }
  };

  const handleGoogleOAuthRedirect = () => {
    const trimmed = googleClientId.trim();
    if (!trimmed) {
      setErrorMsg('Enter an OAuth 2.0 Web Client ID or click Instant Google Sign-In above.');
      return;
    }
    storageSet(CLIENT_ID_STORAGE_KEY, trimmed);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const redirectUri = window.location.origin + window.location.pathname;
      const scope = encodeURIComponent('openid profile email');
      window.location.href =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(trimmed)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${scope}` +
        `&prompt=select_account`;
    }
  };

  const handleSignOut = () => {
    setUser(null);
    storageRemove(USER_STORAGE_KEY);
    setAuthModalVisible(false);
    refreshDocsFromNeon(undefined);
    showToast('Signed out of Google session');
  };

  // ---------- Feature Pillar Cards Definition ----------
  const featureCards: Array<{
    key: StudioMode;
    icon: keyof typeof Feather.glyphMap;
    title: string;
    description: string;
    badge: string;
  }> = [
    {
      key: 'read',
      icon: 'volume-2',
      title: 'Read aloud',
      description: 'Any text, spoken in the voices built into your device.',
      badge: currentTierSpec.premiumVoices
        ? 'PREMIUM NATURAL VOICES'
        : `${browserVoices.length || 'Browser'} Free Voices`,
    },
    {
      key: 'dictate',
      icon: 'mic',
      title: 'Live dictation',
      description: 'Talk and watch your words appear as you speak.',
      badge: recording ? 'RECORDING LIVE' : 'Real-Time STT',
    },
    {
      key: 'transcribe',
      icon: 'upload',
      title: 'Audio to text',
      description: 'Drop a recording and get a full transcript back.',
      badge: uploadedFileName ? 'FILE LOADED' : '.MP3 / .WAV / .TXT',
    },
  ];

  const neonStatusMeta = {
    connecting: { label: 'NEON CONNECTING...', color: '#7C83FF' },
    syncing: { label: 'NEON SYNCING...', color: '#7C83FF' },
    synced: { label: 'NEON POSTGRES LIVE', color: '#00E5B0' },
    'local-fallback': { label: 'LOCAL CACHE MODE', color: '#F59E0B' },
  }[neonStatus];

  const activeDocInQueue = Boolean(
    activeDocId && documents.find((d) => d.id === activeDocId)?.inQueue
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#05070B" />

      {/* Ambient Atmospheric Glow Orbs */}
      <View style={styles.ambientOrbTeal} pointerEvents="none" />
      <View style={styles.ambientOrbIndigo} pointerEvents="none" />

      {/* ---------- Top Glass Navigation Bar ---------- */}
      <View style={styles.navbar}>
        <View style={styles.navBrandRow}>
          <View style={styles.brandIconBox}>
            <MaterialCommunityIcons name="waveform" size={20} color="#00E5B0" />
          </View>
          <Text style={styles.navBrandText}>r2mIQ</Text>
          <View style={styles.navTagPill}>
            <View
              style={[styles.neonDot, { backgroundColor: neonStatusMeta.color }]}
            />
            <Text style={[styles.navTagText, { color: neonStatusMeta.color }]}>
              {neonStatusMeta.label}
            </Text>
          </View>
        </View>

        <View style={styles.navActionsRow}>
          {/* Tier / Pricing Badge Button */}
          <Pressable
            style={[
              styles.tierPillBtn,
              planTier === 'pro' && styles.tierPillBtnPro,
              planTier === 'runiq_bundle' && styles.tierPillBtnBundle,
            ]}
            onPress={() => setPricingModalVisible(true)}
          >
            <Feather
              name={planTier === 'free' ? 'zap' : 'award'}
              size={13}
              color={planTier === 'free' ? '#7C83FF' : '#00E5B0'}
            />
            <Text style={styles.tierPillBtnText}>
              {currentTierSpec.badge} • {currentTierSpec.priceLabel}
            </Text>
          </Pressable>

          {/* Saved Listening Queue Button */}
          <Pressable
            style={styles.vaultTriggerBtn}
            onPress={() => setQueueModalVisible(true)}
          >
            <Feather name="list" size={14} color="#7C83FF" />
            <Text style={styles.vaultTriggerText}>Queue</Text>
            <View style={[styles.vaultCountBadge, { backgroundColor: 'rgba(124,131,255,0.2)' }]}>
              <Text style={[styles.vaultCountBadgeText, { color: '#7C83FF' }]}>
                {queuedDocs.length}
              </Text>
            </View>
          </Pressable>

          {/* Neon Document Vault Button */}
          <Pressable
            style={styles.vaultTriggerBtn}
            onPress={() => {
              refreshDocsFromNeon(user?.email);
              setVaultModalVisible(true);
            }}
          >
            <Feather name="database" size={14} color="#00E5B0" />
            <Text style={styles.vaultTriggerText}>Vault</Text>
            <View style={styles.vaultCountBadge}>
              <Text style={styles.vaultCountBadgeText}>{documents.length}</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.navAuthPill, user && styles.navAuthPillActive]}
            onPress={() => setAuthModalVisible(true)}
          >
            <GoogleGIcon size={18} />
            <Text style={styles.navAuthText} numberOfLines={1}>
              {user ? user.name : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Toast & Error Notifications */}
      {toastMsg && (
        <View style={styles.toastBar}>
          <Feather name="check-circle" size={15} color="#00E5B0" />
          <Text style={styles.toastBarText}>{toastMsg}</Text>
        </View>
      )}
      {errorMsg && (
        <View style={styles.errorBar}>
          <Feather name="alert-circle" size={15} color="#FF6B72" />
          <Text style={styles.errorBarText}>{errorMsg}</Text>
          <Pressable onPress={() => setErrorMsg(null)}>
            <Feather name="x" size={16} color="#FF6B72" />
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------- HERO SECTION + LIVE STUDIO SPLIT ---------- */}
        <View style={[styles.heroWorkspaceGrid, isDesktop && styles.heroWorkspaceGridDesktop]}>
          {/* Left Column: Iconic Hero Typography & Google CTA */}
          <View style={[styles.heroColumn, isDesktop && styles.heroColumnDesktop]}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrowText}>R E A D .   S P E A K .   T R A N S C R I B E .</Text>
            </View>

            <Text
              style={[
                styles.heroHeadline,
                !isTablet && styles.heroHeadlineMobile,
                fontsLoaded && { fontFamily: 'Inter_700Bold' },
              ]}
            >
              Turn text into voice{'\n'}and voice into{' '}
              <Text style={styles.heroHeadlineAccent}>text.</Text>
            </Text>

            <Text
              style={[
                styles.heroSubtitle,
                fontsLoaded && { fontFamily: 'Inter_400Regular' },
              ]}
            >
              r2mIQ is your pocket voice studio. Listen to anything, dictate hands-free and
              transcribe audio files in one place.
            </Text>

            {/* Primary CTA Row: Continue with Google + Upgrade / RunIQ Driver Mode */}
            <View style={styles.heroCtaRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.googleHeroButton,
                  pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
                ]}
                onPress={() => setAuthModalVisible(true)}
              >
                <GoogleGIcon size={26} />
                <Text style={styles.googleHeroButtonText}>
                  {user ? `Connected as ${user.name}` : 'Continue with Google'}
                </Text>
                {user && <Feather name="check-circle" size={16} color="#00E5B0" />}
              </Pressable>

              <Pressable
                style={styles.secondaryHeroBtn}
                onPress={() => setPricingModalVisible(true)}
              >
                <Feather name="layers" size={15} color="#00E5B0" />
                <Text style={styles.secondaryHeroBtnText}>
                  {planTier === 'free'
                    ? 'Unlock Pro & RunIQ Bundle'
                    : `${currentTierSpec.name} Active`}
                </Text>
              </Pressable>
            </View>

            {/* ---------- 3 INTERACTIVE FEATURE PILLAR CARDS ---------- */}
            <View style={[styles.cardsGrid, !isTablet && styles.cardsGridMobile]}>
              {featureCards.map((card) => {
                const isSelected = mode === card.key;
                return (
                  <Pressable
                    key={card.key}
                    onPress={() => handleSelectMode(card.key)}
                    style={({ pressed }) => [
                      styles.featureCard,
                      isSelected && styles.featureCardActive,
                      pressed && { transform: [{ scale: 0.985 }] },
                    ]}
                  >
                    <View style={styles.featureCardTopRow}>
                      <View
                        style={[
                          styles.featureIconWrap,
                          isSelected && styles.featureIconWrapActive,
                        ]}
                      >
                        <Feather
                          name={card.icon}
                          size={20}
                          color={isSelected ? '#05080D' : '#00E5B0'}
                        />
                      </View>
                      <View
                        style={[
                          styles.featureCardBadge,
                          isSelected && styles.featureCardBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.featureCardBadgeText,
                            isSelected && styles.featureCardBadgeTextActive,
                          ]}
                        >
                          {card.badge}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.featureCardTitle}>{card.title}</Text>
                    <Text style={styles.featureCardDesc}>{card.description}</Text>

                    <View style={styles.featureCardFooter}>
                      <Text
                        style={[
                          styles.featureCardActionText,
                          isSelected && { color: '#00E5B0' },
                        ]}
                      >
                        {isSelected ? 'Active Studio Mode' : 'Switch to mode'}
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={14}
                        color={isSelected ? '#00E5B0' : '#556075'}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Right / Bottom Column: Interactive Live Pocket Voice Studio Deck */}
          <View style={[styles.studioDeckCard, isDesktop && styles.studioDeckCardDesktop]}>
            {/* Daily Usage Quota Bar + RunIQ Driver Mode Toggle */}
            <View style={styles.quotaHeaderStrip}>
              <View style={{ flex: 1 }}>
                <View style={styles.quotaLabelRow}>
                  <Text style={styles.quotaTitleText}>
                    {currentTierSpec.name.toUpperCase()} QUOTA
                  </Text>
                  <Text style={styles.quotaCountText}>
                    {dailyCharsUsed.toLocaleString()} /{' '}
                    {currentTierSpec.dailyCharLimit.toLocaleString()} chars today (
                    {quotaPercentage}%)
                  </Text>
                </View>
                <View style={styles.quotaTrack}>
                  <View
                    style={[
                      styles.quotaFill,
                      {
                        width: `${quotaPercentage}%`,
                        backgroundColor:
                          quotaPercentage > 85 ? '#FF6B72' : '#00E5B0',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* RunIQ Driver Mode Quick Pill */}
              <Pressable
                style={[
                  styles.driverModeBtn,
                  driverModeActive && styles.driverModeBtnActive,
                ]}
                onPress={() => {
                  if (!currentTierSpec.driverMode) {
                    setPricingModalVisible(true);
                    showToast('RunIQ Driver Mode is included in the RunIQ Add-On Bundle');
                    return;
                  }
                  setDriverModeActive((prev) => !prev);
                }}
              >
                <Feather
                  name="navigation"
                  size={13}
                  color={driverModeActive ? '#04100D' : '#00E5B0'}
                />
                <Text
                  style={[
                    styles.driverModeBtnText,
                    driverModeActive && { color: '#04100D', fontWeight: '800' },
                  ]}
                >
                  {driverModeActive ? 'RunIQ Driver ON' : 'RunIQ Driver'}
                </Text>
              </Pressable>
            </View>

            {/* Studio Header with Mode Switcher Tabs & Live Soundwave */}
            <View style={styles.studioDeckHeader}>
              <View style={styles.studioModeTabs}>
                {(
                  [
                    { key: 'read', label: 'Read Aloud', icon: 'volume-2' },
                    { key: 'dictate', label: 'Live Dictation', icon: 'mic' },
                    { key: 'transcribe', label: 'Audio to Text', icon: 'upload' },
                  ] as const
                ).map((tab) => {
                  const active = mode === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => handleSelectMode(tab.key)}
                      style={[styles.studioTab, active && styles.studioTabActive]}
                    >
                      <Feather
                        name={tab.icon}
                        size={14}
                        color={active ? '#00E5B0' : '#7E8A9F'}
                      />
                      <Text
                        style={[
                          styles.studioTabText,
                          active && styles.studioTabTextActive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <SoundwaveVisualizer
                active={speaking || recording}
                accentColor={recording ? '#7C83FF' : '#00E5B0'}
              />
            </View>

            {/* Document Title Bar & Queue Toggle */}
            <View style={styles.docTitleRow}>
              <Feather name="file-text" size={15} color="#7C83FF" />
              <TextInput
                style={styles.docTitleInput}
                value={docTitle}
                onChangeText={setDocTitle}
                placeholder="Untitled Voice Document..."
                placeholderTextColor="#556075"
              />
              <Pressable
                style={[
                  styles.newDocIconBtn,
                  activeDocInQueue && {
                    backgroundColor: 'rgba(124, 131, 255, 0.2)',
                    borderColor: '#7C83FF',
                  },
                ]}
                onPress={handleToggleCurrentDocInQueue}
              >
                <Feather
                  name={activeDocInQueue ? 'check' : 'list'}
                  size={13}
                  color="#7C83FF"
                />
                <Text style={[styles.newDocIconBtnText, { color: '#7C83FF' }]}>
                  {activeDocInQueue ? 'Queued' : '+ Queue'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.newDocIconBtn}
                onPress={() => {
                  setActiveDocId(null);
                  setDocTitle('New Studio Transcript');
                  setText('');
                  showToast('Started fresh studio document');
                }}
              >
                <Feather name="plus" size={14} color="#00E5B0" />
                <Text style={styles.newDocIconBtnText}>New</Text>
              </Pressable>
              <View style={styles.docMetricsPill}>
                <Text style={styles.docMetricsText}>
                  {metrics.words}w • {metrics.duration}
                </Text>
              </View>
            </View>

            {/* RunIQ Hands-Free Driver Mode Oversized Deck (when active) */}
            {driverModeActive && (
              <View style={styles.driverDeckBanner}>
                <View style={styles.driverDeckHeader}>
                  <Feather name="navigation" size={16} color="#00E5B0" />
                  <Text style={styles.driverDeckTitle}>
                    RUNIQ HANDS-FREE DRIVER CONSOLE ({queuedDocs.length} DISPATCHES IN QUEUE)
                  </Text>
                </View>
                <View style={styles.driverDeckBtnsRow}>
                  <Pressable
                    style={styles.driverGiantBtnTeal}
                    onPress={() =>
                      speaking ? handleStopSpeaking() : playQueueFromIndex(0)
                    }
                  >
                    <Feather
                      name={speaking ? 'square' : 'play'}
                      size={22}
                      color="#04100D"
                    />
                    <Text style={styles.driverGiantBtnTextDark}>
                      {speaking ? 'STOP ROAD AUDIO' : 'PLAY SAVED QUEUE'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.driverGiantBtnIndigo}
                    onPress={() => (recording ? stopRecording() : startRecording())}
                  >
                    <Feather
                      name={recording ? 'mic-off' : 'mic'}
                      size={22}
                      color="#FFFFFF"
                    />
                    <Text style={styles.driverGiantBtnTextLight}>
                      {recording ? 'STOP VOICE MEMO' : 'HANDS-FREE DICTATE'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Conditional Mode Banner: Audio Dropzone when in 'transcribe' mode */}
            {mode === 'transcribe' && (
              <Pressable
                style={styles.audioDropzone}
                onPress={handlePickAudioOrDocFile}
              >
                <View style={styles.audioDropzoneIconCircle}>
                  <Feather name="upload-cloud" size={22} color="#00E5B0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.audioDropzoneTitle}>
                    {uploadedFileName
                      ? `Loaded: ${uploadedFileName} (${uploadedFileSize})`
                      : 'Drop an audio recording (.MP3, .WAV, .M4A) or text doc (.TXT, .MD)'}
                  </Text>
                  <Text style={styles.audioDropzoneSub}>
                    {isTranscribingAudio
                      ? 'Transcribing audio stream in real time...'
                      : 'Click to browse files from your device and extract full transcript'}
                  </Text>
                </View>
                <View style={styles.audioDropzoneBtn}>
                  <Text style={styles.audioDropzoneBtnText}>Select File</Text>
                </View>
              </Pressable>
            )}

            {/* Main Studio Text / Transcript Canvas */}
            <View
              style={[
                styles.editorBox,
                recording && styles.editorBoxRecording,
                speaking && styles.editorBoxSpeaking,
              ]}
            >
              <TextInput
                style={[
                  styles.editorTextInput,
                  fontsLoaded && { fontFamily: 'Inter_400Regular' },
                ]}
                multiline
                value={text}
                onChangeText={setText}
                placeholder={
                  mode === 'read'
                    ? 'Paste or type any article, book passage, or notes here to listen aloud...'
                    : mode === 'dictate'
                    ? 'Press "Start Dictation" below and speak naturally — your words will stream here in real time...'
                    : 'Drop an audio recording above or dictate to generate your timestamped transcript...'
                }
                placeholderTextColor="#4B5568"
                textAlignVertical="top"
              />

              {/* Live Interim Dictation Bubble */}
              {interimTranscript.length > 0 && (
                <View style={styles.interimBubble}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.interimBubbleText}>{interimTranscript}...</Text>
                </View>
              )}
            </View>

            {/* Voice & Playback Settings Row */}
            <View style={styles.voiceSettingsBar}>
              {/* Device / Premium Voice Picker Trigger */}
              <Pressable
                style={styles.voicePickerBtn}
                onPress={() => setVoiceModalVisible(true)}
              >
                <Feather
                  name={activeVoiceProfile.isPremium ? 'award' : 'sliders'}
                  size={13}
                  color="#00E5B0"
                />
                <Text style={styles.voicePickerBtnText} numberOfLines={1}>
                  {activeVoiceProfile.name}
                </Text>
                <View style={styles.voiceMiniTag}>
                  <Text style={styles.voiceMiniTagText}>
                    {activeVoiceProfile.isPremium ? 'PRO' : 'FREE'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={13} color="#7E8A9F" />
              </Pressable>

              {/* Speed Multiplier Pills */}
              <View style={styles.speedPillGroup}>
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
                  const active = speechRate === rate;
                  return (
                    <Pressable
                      key={rate}
                      onPress={() => setSpeechRate(rate)}
                      style={[styles.speedPill, active && styles.speedPillActive]}
                    >
                      <Text
                        style={[
                          styles.speedPillText,
                          active && styles.speedPillTextActive,
                        ]}
                      >
                        {rate}x
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Primary Studio Action Controls */}
            <View style={styles.studioControlsFooter}>
              <View style={styles.primaryTransportGroup}>
                {/* Read Aloud Play / Stop */}
                {speaking ? (
                  <Pressable
                    style={[styles.transportBtn, styles.transportBtnDanger]}
                    onPress={handleStopSpeaking}
                  >
                    <Feather name="square" size={16} color="#FFFFFF" />
                    <Text style={styles.transportBtnTextLight}>Stop Audio</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.transportBtn, styles.transportBtnTeal]}
                    onPress={handleSpeak}
                  >
                    <Feather name="volume-2" size={17} color="#04100D" />
                    <Text style={styles.transportBtnTextDark}>Read Aloud</Text>
                  </Pressable>
                )}

                {/* Play Saved Queue (Pro & RunIQ Bundle) */}
                <Pressable
                  style={[styles.transportBtn, styles.transportBtnQueue]}
                  onPress={() => playQueueFromIndex(0)}
                >
                  <Feather name="play-circle" size={16} color="#00E5B0" />
                  <Text style={styles.transportBtnQueueText}>
                    Play Queue ({queuedDocs.length})
                  </Text>
                </Pressable>

                {/* Live Dictation Start / Stop */}
                {recording ? (
                  <Pressable
                    style={[styles.transportBtn, styles.transportBtnDanger]}
                    onPress={stopRecording}
                  >
                    <Feather name="mic-off" size={16} color="#FFFFFF" />
                    <Text style={styles.transportBtnTextLight}>Stop Mic</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.transportBtn, styles.transportBtnIndigo]}
                    onPress={startRecording}
                  >
                    <Feather name="mic" size={16} color="#FFFFFF" />
                    <Text style={styles.transportBtnTextLight}>Dictate</Text>
                  </Pressable>
                )}
              </View>

              {/* Document Save to Neon & Export Utilities */}
              <View style={styles.utilityButtonsRow}>
                <Pressable
                  style={[styles.utilBtn, styles.utilBtnNeon]}
                  onPress={() => handleSaveToVault(false)}
                >
                  <Feather name="database" size={13} color="#00E5B0" />
                  <Text style={[styles.utilBtnText, { color: '#00E5B0' }]}>
                    Save to Neon
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.utilBtn}
                  onPress={() => handleExportFile('txt')}
                >
                  <Feather name="download" size={14} color="#E2E8F0" />
                  <Text style={styles.utilBtnText}>.TXT</Text>
                </Pressable>

                <Pressable
                  style={styles.utilBtn}
                  onPress={() => handleExportFile('md')}
                >
                  <Feather name="file-text" size={14} color="#E2E8F0" />
                  <Text style={styles.utilBtnText}>.MD</Text>
                </Pressable>

                <Pressable style={styles.utilBtn} onPress={handleCopyText}>
                  <Feather name="copy" size={14} color="#E2E8F0" />
                  <Text style={styles.utilBtnText}>Copy</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ---------- Bottom Install / PWA & Tier Economics Bar ---------- */}
        <View style={styles.bottomPwaBar}>
          <View style={styles.bottomPwaLeft}>
            <MaterialCommunityIcons name="waveform" size={16} color="#4A5568" />
            <Text style={styles.bottomPwaText}>
              INSTALL ON YOUR PHONE FROM THE BROWSER MENU  •  {currentTierSpec.unitEconomicsNote.toUpperCase()}
            </Text>
          </View>
          <View style={styles.bottomPwaRight}>
            <Text style={styles.bottomPwaVaultStatus}>
              {user
                ? `${currentTierSpec.badge} • ${user.email.toUpperCase()}`
                : `${documents.length} DOCS IN NEON VAULT • ${queuedDocs.length} IN QUEUE`}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ---------- Modal 1: Subscription Tiers & RunIQ Driver Bundle ---------- */}
      <Modal
        visible={pricingModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPricingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 680 }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <Feather name="layers" size={19} color="#00E5B0" />
                <Text style={styles.modalTitle}>
                  r2mIQ Plans & RunIQ Driver Add-On
                </Text>
              </View>
              <Pressable onPress={() => setPricingModalVisible(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <Text style={styles.authModalDesc}>
              Start free with built-in device voices, upgrade to Pro for natural neural
              voices & Saved Queue, or bundle with RunIQ for hands-free road audio.
            </Text>

            <View style={styles.pricingPlansCol}>
              {(
                [
                  {
                    spec: TIER_SPECS.free,
                    features: [
                      'Built-in browser & device voices ($0 TTS cost)',
                      '5,000 characters / day synthesis & dictation limit',
                      'Up to 5 saved documents in Neon Vault',
                    ],
                  },
                  {
                    spec: TIER_SPECS.pro,
                    features: [
                      '4 Studio Natural Voices (Nova, Orion, Aria, Vega)',
                      '150,000 characters / day high-volume studio limit',
                      'Saved Listening Queue (auto-advance playlist) & Unlimited Vault',
                    ],
                  },
                  {
                    spec: TIER_SPECS.runiq_bundle,
                    features: [
                      'Everything in Pro at a discounted RunIQ driver add-on rate',
                      'Hands-Free RunIQ Driver Console (oversized road controls)',
                      '300,000 chars / day + automatic dispatch & voice memo queue',
                    ],
                  },
                ] as const
              ).map(({ spec, features }) => {
                const isCurrent = planTier === spec.id;
                return (
                  <Pressable
                    key={spec.id}
                    onPress={() => handleSelectPlanTier(spec.id)}
                    style={[
                      styles.planCard,
                      isCurrent && styles.planCardActive,
                    ]}
                  >
                    <View style={styles.planCardHeader}>
                      <View>
                        <Text style={styles.planBadgeText}>{spec.badge}</Text>
                        <Text style={styles.planNameText}>{spec.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.planPriceText}>{spec.priceLabel}</Text>
                        {isCurrent && (
                          <Text style={styles.planActiveTag}>CURRENT PLAN</Text>
                        )}
                      </View>
                    </View>

                    <View style={{ gap: 5, marginTop: 8 }}>
                      {features.map((f, i) => (
                        <View key={i} style={styles.planFeatureRow}>
                          <Feather name="check" size={13} color="#00E5B0" />
                          <Text style={styles.planFeatureText}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Modal 2: Saved Listening Queue (Playlist) ---------- */}
      <Modal
        visible={queueModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <Feather name="list" size={18} color="#7C83FF" />
                <Text style={styles.modalTitle}>
                  Saved Listening Queue ({queuedDocs.length})
                </Text>
              </View>
              <Pressable onPress={() => setQueueModalVisible(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {!currentTierSpec.savedQueue && (
              <Pressable
                style={styles.queueUpgradeBanner}
                onPress={() => {
                  setQueueModalVisible(false);
                  setPricingModalVisible(true);
                }}
              >
                <Feather name="lock" size={15} color="#00E5B0" />
                <Text style={styles.queueUpgradeBannerText}>
                  Saved Listening Queue auto-play requires r2mIQ Pro ($4.99/mo) or the
                  RunIQ Driver Add-On (+$2.99/mo). Tap to unlock.
                </Text>
              </Pressable>
            )}

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {queuedDocs.length === 0 ? (
                <Text style={{ color: '#94A3B8', paddingVertical: 18 }}>
                  No documents in your queue yet. Click "+ Queue" on any document to
                  build your hands-free listening playlist.
                </Text>
              ) : (
                queuedDocs.map((doc, idx) => (
                  <Pressable
                    key={doc.id}
                    onPress={() => handleOpenSavedDoc(doc)}
                    style={styles.vaultItem}
                  >
                    <View style={styles.vaultItemTop}>
                      <Text style={styles.vaultItemCategory}>
                        #{idx + 1} IN QUEUE • {doc.category}
                      </Text>
                      <Pressable
                        onPress={async () => {
                          const updated = documents.map((d) =>
                            d.id === doc.id ? { ...d, inQueue: false, queueOrder: 0 } : d
                          );
                          setDocuments(updated);
                          storageSet(DOCS_STORAGE_KEY, JSON.stringify(updated));
                          try {
                            await toggleDocumentQueueInNeon(doc.id, false, 0);
                          } catch {
                            // Ignore
                          }
                        }}
                      >
                        <Feather name="x-circle" size={15} color="#64748B" />
                      </Pressable>
                    </View>
                    <Text style={styles.vaultItemTitle}>{doc.title}</Text>
                    <Text style={styles.vaultItemPreview} numberOfLines={2}>
                      {doc.content}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>

            {queuedDocs.length > 0 && (
              <Pressable
                style={[styles.googleHeroButton, { marginTop: 12 }]}
                onPress={() => {
                  setQueueModalVisible(false);
                  playQueueFromIndex(0);
                }}
              >
                <Feather name="play" size={16} color="#FFFFFF" />
                <Text style={styles.googleHeroButtonText}>
                  Play Entire Queue ({queuedDocs.length} Docs)
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* ---------- Modal 3: Saved Documents Vault (Neon Postgres) ---------- */}
      <Modal
        visible={vaultModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setVaultModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <Feather name="database" size={18} color="#00E5B0" />
                <Text style={styles.modalTitle}>Neon Postgres Document Vault</Text>
              </View>
              <Pressable onPress={() => setVaultModalVisible(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <View style={styles.vaultSearchRow}>
              <Feather name="search" size={15} color="#64748B" />
              <TextInput
                style={styles.vaultSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search Neon transcripts & documents..."
                placeholderTextColor="#64748B"
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredDocs.map((doc) => {
                const isCurrent = doc.id === activeDocId;
                return (
                  <Pressable
                    key={doc.id}
                    onPress={() => handleOpenSavedDoc(doc)}
                    style={[styles.vaultItem, isCurrent && styles.vaultItemCurrent]}
                  >
                    <View style={styles.vaultItemTop}>
                      <Text style={styles.vaultItemCategory}>
                        {doc.category} {doc.inQueue ? '• IN QUEUE' : ''}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteSavedDoc(doc.id)}
                        hitSlop={8}
                      >
                        <Feather name="trash-2" size={14} color="#64748B" />
                      </Pressable>
                    </View>
                    <Text style={styles.vaultItemTitle}>{doc.title}</Text>
                    <Text style={styles.vaultItemPreview} numberOfLines={2}>
                      {doc.content || 'Empty transcript...'}
                    </Text>
                    <Text style={styles.vaultItemMeta}>
                      {doc.wordCount} words •{' '}
                      {new Date(doc.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Modal 4: Free Browser Voices vs Premium Natural Voices ---------- */}
      <Modal
        visible={voiceModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <Feather name="volume-2" size={18} color="#00E5B0" />
                <Text style={styles.modalTitle}>Select Studio or Browser Voice</Text>
              </View>
              <Pressable onPress={() => setVoiceModalVisible(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 390 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.voiceSectionHeader}>
                PREMIUM NATURAL VOICES (PRO & RUNIQ BUNDLE)
              </Text>
              {PREMIUM_NATURAL_VOICES.map((v) => {
                const selected = v.identifier === selectedVoiceId;
                const locked = !currentTierSpec.premiumVoices;
                return (
                  <Pressable
                    key={v.identifier}
                    onPress={() => {
                      if (locked) {
                        setVoiceModalVisible(false);
                        setPricingModalVisible(true);
                        showToast('Upgrade to Pro ($4.99/mo) to unlock Premium Natural Voices');
                        return;
                      }
                      setSelectedVoiceId(v.identifier);
                      setVoiceModalVisible(false);
                      showToast(`Selected ${v.name}`);
                    }}
                    style={[
                      styles.voiceOptionRow,
                      selected && styles.voiceOptionRowSelected,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceOptionName}>{v.name}</Text>
                      <Text style={styles.voiceOptionLang}>
                        {v.language} • {v.tag}
                      </Text>
                    </View>
                    {locked ? (
                      <View style={styles.lockedVoicePill}>
                        <Feather name="lock" size={11} color="#7C83FF" />
                        <Text style={styles.lockedVoicePillText}>PRO</Text>
                      </View>
                    ) : (
                      selected && (
                        <Feather name="check-circle" size={16} color="#00E5B0" />
                      )
                    )}
                  </Pressable>
                );
              })}

              <Text style={[styles.voiceSectionHeader, { marginTop: 14 }]}>
                BUILT-IN BROWSER & DEVICE VOICES (FREE TIER)
              </Text>
              {browserVoices.length === 0 ? (
                <Text style={{ color: '#94A3B8', paddingVertical: 12 }}>
                  Default system browser voice active (en-US).
                </Text>
              ) : (
                browserVoices.map((v) => {
                  const selected = v.identifier === selectedVoiceId;
                  return (
                    <Pressable
                      key={v.identifier}
                      onPress={() => {
                        setSelectedVoiceId(v.identifier);
                        setVoiceModalVisible(false);
                        showToast(`Voice set to ${v.name}`);
                      }}
                      style={[
                        styles.voiceOptionRow,
                        selected && styles.voiceOptionRowSelected,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voiceOptionName}>{v.name}</Text>
                        <Text style={styles.voiceOptionLang}>
                          {v.language} • FREE BROWSER VOICE
                        </Text>
                      </View>
                      {selected && (
                        <Feather name="check-circle" size={16} color="#00E5B0" />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Modal 5: Continue with Google Authentication ---------- */}
      <Modal
        visible={authModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAuthModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <GoogleGIcon size={22} />
                <Text style={styles.modalTitle}>Continue with Google</Text>
              </View>
              <Pressable onPress={() => setAuthModalVisible(false)}>
                <Feather name="x" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {user ? (
              <View style={styles.signedInContainer}>
                <View style={styles.signedInAvatarCircle}>
                  <Text style={styles.signedInAvatarInitial}>
                    {user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.signedInUserTitle}>{user.name}</Text>
                <Text style={styles.signedInUserSub}>{user.email}</Text>
                <View style={styles.signedInStatusBadge}>
                  <Feather name="check-circle" size={13} color="#00E5B0" />
                  <Text style={styles.signedInStatusText}>
                    {currentTierSpec.name} • {documents.length} Neon Docs Synced
                  </Text>
                </View>

                <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
                  <Feather name="log-out" size={15} color="#FF6B72" />
                  <Text style={styles.signOutBtnText}>Sign Out</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                <Text style={styles.authModalDesc}>
                  Sign in with your Google account to sync your subscription tier, daily
                  character quota, listening queue, and transcripts to Neon Postgres.
                </Text>

                <View style={styles.authBox}>
                  <Text style={styles.authBoxTitle}>Instant Google Account Sign-In</Text>
                  <TextInput
                    style={styles.authTextInput}
                    value={customNameInput}
                    onChangeText={setCustomNameInput}
                    placeholder="Your Name"
                    placeholderTextColor="#64748B"
                  />
                  <TextInput
                    style={styles.authTextInput}
                    value={customEmailInput}
                    onChangeText={setCustomEmailInput}
                    placeholder="your.email@gmail.com"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.googleHeroButton}
                    onPress={handleQuickGoogleSignIn}
                  >
                    <GoogleGIcon size={22} />
                    <Text style={styles.googleHeroButtonText}>
                      Continue as {customNameInput.split(' ')[0] || 'User'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.authBox}>
                  <Text style={styles.authBoxTitle}>
                    Google Cloud OAuth 2.0 Client Redirect (Optional)
                  </Text>
                  <TextInput
                    style={styles.authTextInput}
                    value={googleClientId}
                    onChangeText={setGoogleClientId}
                    placeholder="xxxx.apps.googleusercontent.com"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.oauthRedirectBtn}
                    onPress={handleGoogleOAuthRedirect}
                  >
                    <Feather name="external-link" size={14} color="#00E5B0" />
                    <Text style={styles.oauthRedirectBtnText}>
                      Authorize via accounts.google.com
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#05070B',
  },
  ambientOrbTeal: {
    position: 'absolute',
    bottom: -120,
    left: -100,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(0, 229, 176, 0.06)',
  },
  ambientOrbIndigo: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  // ---------- Top Navbar ----------
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(5, 7, 11, 0.85)',
    flexWrap: 'wrap',
    gap: 10,
  },
  navBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 229, 176, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBrandText: {
    color: '#F8FAFC',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  navTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.25)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  navTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(124, 131, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 131, 255, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tierPillBtnPro: {
    backgroundColor: 'rgba(0, 229, 176, 0.12)',
    borderColor: '#00E5B0',
  },
  tierPillBtnBundle: {
    backgroundColor: 'rgba(0, 229, 176, 0.18)',
    borderColor: '#00E5B0',
  },
  tierPillBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  vaultTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#0D111A',
    borderWidth: 1,
    borderColor: '#1E2638',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  vaultTriggerText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  vaultCountBadge: {
    backgroundColor: 'rgba(0, 229, 176, 0.16)',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  vaultCountBadgeText: {
    color: '#00E5B0',
    fontSize: 11,
    fontWeight: '700',
  },
  navAuthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111622',
    borderWidth: 1,
    borderColor: '#232C40',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: 190,
  },
  navAuthPillActive: {
    borderColor: 'rgba(0, 229, 176, 0.45)',
  },
  navAuthText: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  // ---------- Banners ----------
  toastBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 229, 176, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 229, 176, 0.3)',
    paddingHorizontal: 28,
    paddingVertical: 9,
  },
  toastBarText: {
    color: '#00E5B0',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 107, 114, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 107, 114, 0.35)',
    paddingHorizontal: 28,
    paddingVertical: 9,
  },
  errorBarText: {
    color: '#FF6B72',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginLeft: 8,
  },
  // ---------- Main Scroll & Grid ----------
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 36,
    maxWidth: 1380,
    width: '100%',
    alignSelf: 'center',
  },
  heroWorkspaceGrid: {
    flexDirection: 'column',
    gap: 28,
  },
  heroWorkspaceGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 34,
  },
  heroColumn: {
    flex: 1,
  },
  heroColumnDesktop: {
    flex: 1.05,
  },
  eyebrowRow: {
    marginBottom: 16,
  },
  eyebrowText: {
    color: '#00E5B0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  heroHeadline: {
    color: '#FFFFFF',
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginBottom: 20,
  },
  heroHeadlineMobile: {
    fontSize: 38,
    lineHeight: 44,
  },
  heroHeadlineAccent: {
    color: '#7C83FF',
  },
  heroSubtitle: {
    color: '#94A3B8',
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 540,
    marginBottom: 28,
  },
  // ---------- Google Pill CTA ----------
  heroCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 36,
  },
  googleHeroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#5B65F5',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#7680FF',
  },
  googleHeroButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  googleGCircle: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGText: {
    color: '#4285F4',
    fontWeight: '800',
  },
  secondaryHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#0E131D',
    borderWidth: 1,
    borderColor: '#1E2738',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
  },
  secondaryHeroBtnText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  // ---------- 3 Feature Pillar Cards ----------
  cardsGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  cardsGridMobile: {
    flexDirection: 'column',
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#0B0E15',
    borderWidth: 1,
    borderColor: '#181F2E',
    borderRadius: 16,
    padding: 20,
    justifyContent: 'space-between',
    minHeight: 168,
  },
  featureCardActive: {
    borderColor: '#00E5B0',
    backgroundColor: '#0D141C',
  },
  featureCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 176, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconWrapActive: {
    backgroundColor: '#00E5B0',
  },
  featureCardBadge: {
    backgroundColor: '#111723',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1E2738',
  },
  featureCardBadgeActive: {
    backgroundColor: 'rgba(0, 229, 176, 0.14)',
    borderColor: 'rgba(0, 229, 176, 0.4)',
  },
  featureCardBadgeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  featureCardBadgeTextActive: {
    color: '#00E5B0',
  },
  featureCardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  featureCardDesc: {
    color: '#8B98AF',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  featureCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  featureCardActionText: {
    color: '#556075',
    fontSize: 11,
    fontWeight: '600',
  },
  // ---------- Right / Interactive Voice Studio Deck ----------
  studioDeckCard: {
    flex: 1,
    backgroundColor: '#0A0D14',
    borderWidth: 1,
    borderColor: '#1B2333',
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  studioDeckCardDesktop: {
    flex: 0.98,
  },
  quotaHeaderStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: '#0E131D',
    borderWidth: 1,
    borderColor: '#1A2334',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quotaLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  quotaTitleText: {
    color: '#00E5B0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  quotaCountText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  quotaTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1A2334',
    overflow: 'hidden',
  },
  quotaFill: {
    height: '100%',
    borderRadius: 3,
  },
  driverModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.35)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  driverModeBtnActive: {
    backgroundColor: '#00E5B0',
    borderColor: '#00E5B0',
  },
  driverModeBtnText: {
    color: '#00E5B0',
    fontSize: 11,
    fontWeight: '700',
  },
  driverDeckBanner: {
    backgroundColor: '#0D1520',
    borderWidth: 1,
    borderColor: '#00E5B0',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  driverDeckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  driverDeckTitle: {
    color: '#00E5B0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  driverDeckBtnsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  driverGiantBtnTeal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#00E5B0',
    paddingVertical: 16,
    borderRadius: 12,
  },
  driverGiantBtnIndigo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#5B65F5',
    paddingVertical: 16,
    borderRadius: 12,
  },
  driverGiantBtnTextDark: {
    color: '#04100D',
    fontSize: 13,
    fontWeight: '800',
  },
  driverGiantBtnTextLight: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  studioDeckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  studioModeTabs: {
    flexDirection: 'row',
    backgroundColor: '#06080D',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#151C28',
    gap: 4,
  },
  studioTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  studioTabActive: {
    backgroundColor: '#121926',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.35)',
  },
  studioTabText: {
    color: '#7E8A9F',
    fontSize: 12,
    fontWeight: '600',
  },
  studioTabTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: 6,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1C2536',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  docTitleInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    padding: 0,
  },
  newDocIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 229, 176, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  newDocIconBtnText: {
    color: '#00E5B0',
    fontSize: 11,
    fontWeight: '700',
  },
  docMetricsPill: {
    backgroundColor: '#161E2E',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  docMetricsText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  // ---------- Audio Dropzone ----------
  audioDropzone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(0, 229, 176, 0.05)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 229, 176, 0.45)',
    borderRadius: 14,
    padding: 14,
  },
  audioDropzoneIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 229, 176, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioDropzoneTitle: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
  },
  audioDropzoneSub: {
    color: '#8B98AF',
    fontSize: 12,
    marginTop: 2,
  },
  audioDropzoneBtn: {
    backgroundColor: '#00E5B0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  audioDropzoneBtnText: {
    color: '#04100D',
    fontSize: 12,
    fontWeight: '700',
  },
  // ---------- Studio Text Canvas ----------
  editorBox: {
    minHeight: 200,
    backgroundColor: '#070A0F',
    borderWidth: 1,
    borderColor: '#182030',
    borderRadius: 14,
    padding: 16,
    justifyContent: 'space-between',
  },
  editorBoxRecording: {
    borderColor: '#7C83FF',
    backgroundColor: '#090B14',
  },
  editorBoxSpeaking: {
    borderColor: '#00E5B0',
  },
  editorTextInput: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 15,
    lineHeight: 24,
    minHeight: 165,
    padding: 0,
  },
  interimBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(124, 131, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 131, 255, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5B0',
  },
  interimBubbleText: {
    color: '#C7D2FE',
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  // ---------- Voice Settings Bar ----------
  voiceSettingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  voicePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1E2738',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    maxWidth: 290,
  },
  voicePickerBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  voiceMiniTag: {
    backgroundColor: 'rgba(0, 229, 176, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  voiceMiniTagText: {
    color: '#00E5B0',
    fontSize: 9,
    fontWeight: '800',
  },
  speedPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1E2738',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  speedPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  speedPillActive: {
    backgroundColor: '#5B65F5',
  },
  speedPillText: {
    color: '#7E8A9F',
    fontSize: 11,
    fontWeight: '600',
  },
  speedPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // ---------- Studio Transport & Export Controls ----------
  studioControlsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#141B29',
  },
  primaryTransportGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  transportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
  },
  transportBtnTeal: {
    backgroundColor: '#00E5B0',
  },
  transportBtnQueue: {
    backgroundColor: 'rgba(0, 229, 176, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.35)',
  },
  transportBtnQueueText: {
    color: '#00E5B0',
    fontSize: 12,
    fontWeight: '700',
  },
  transportBtnIndigo: {
    backgroundColor: '#5B65F5',
  },
  transportBtnDanger: {
    backgroundColor: '#EF4444',
  },
  transportBtnTextDark: {
    color: '#04100D',
    fontSize: 13,
    fontWeight: '700',
  },
  transportBtnTextLight: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  utilityButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  utilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#111723',
    borderWidth: 1,
    borderColor: '#1F293D',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  utilBtnNeon: {
    borderColor: 'rgba(0, 229, 176, 0.4)',
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
  },
  utilBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  // ---------- Bottom PWA Footer ----------
  bottomPwaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 36,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  bottomPwaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomPwaText: {
    color: '#4B5568',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  bottomPwaRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomPwaVaultStatus: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  // ---------- Modals ----------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 9, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 510,
    backgroundColor: '#0B0F17',
    borderWidth: 1,
    borderColor: '#1E2738',
    borderRadius: 18,
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  pricingPlansCol: {
    gap: 12,
    marginTop: 14,
  },
  planCard: {
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1E2738',
    borderRadius: 14,
    padding: 16,
  },
  planCardActive: {
    borderColor: '#00E5B0',
    backgroundColor: 'rgba(0, 229, 176, 0.06)',
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planBadgeText: {
    color: '#00E5B0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  planNameText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  planPriceText: {
    color: '#7C83FF',
    fontSize: 18,
    fontWeight: '800',
  },
  planActiveTag: {
    color: '#00E5B0',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planFeatureText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  queueUpgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  queueUpgradeBannerText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  vaultSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#070A0F',
    borderWidth: 1,
    borderColor: '#1A2232',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  vaultSearchInput: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 13,
    padding: 0,
  },
  vaultItem: {
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1C2536',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  vaultItemCurrent: {
    borderColor: '#00E5B0',
  },
  vaultItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vaultItemCategory: {
    color: '#00E5B0',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  vaultItemTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  vaultItemPreview: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  vaultItemMeta: {
    color: '#64748B',
    fontSize: 11,
  },
  voiceSectionHeader: {
    color: '#00E5B0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  voiceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#141B29',
  },
  voiceOptionRowSelected: {
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
  },
  voiceOptionName: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceOptionLang: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  lockedVoicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 131, 255, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lockedVoicePillText: {
    color: '#7C83FF',
    fontSize: 10,
    fontWeight: '800',
  },
  authModalDesc: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  authBox: {
    backgroundColor: '#0F141F',
    borderWidth: 1,
    borderColor: '#1C2536',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  authBoxTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  authTextInput: {
    backgroundColor: '#070A0F',
    borderWidth: 1,
    borderColor: '#1E2738',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
  },
  oauthRedirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 176, 0.4)',
    backgroundColor: 'rgba(0, 229, 176, 0.08)',
  },
  oauthRedirectBtnText: {
    color: '#00E5B0',
    fontSize: 13,
    fontWeight: '700',
  },
  signedInContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  signedInAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5B65F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedInAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  signedInUserTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  signedInUserSub: {
    color: '#94A3B8',
    fontSize: 13,
  },
  signedInStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 176, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 6,
  },
  signedInStatusText: {
    color: '#00E5B0',
    fontSize: 12,
    fontWeight: '600',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 114, 0.4)',
  },
  signOutBtnText: {
    color: '#FF6B72',
    fontSize: 13,
    fontWeight: '700',
  },
});
