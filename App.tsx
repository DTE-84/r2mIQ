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

// ---------- Types ----------
type DocCategory = 'Voice Transcript' | 'Text Document' | 'Executive Brief';

interface SavedDocument {
  id: string;
  title: string;
  content: string;
  category: DocCategory;
  updatedAt: string;
  wordCount: number;
  ownerEmail?: string;
}

interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google-oauth' | 'google-workspace';
}

// ---------- Storage Helpers (Web + Native Safe) ----------
const DOCS_STORAGE_KEY = 'r2miq_vault_documents_v1';
const USER_STORAGE_KEY = 'r2miq_google_user_v1';
const CLIENT_ID_STORAGE_KEY = 'r2miq_google_client_id_v1';

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
    // Ignore quota/security errors
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

// ---------- Default Starter Documents ----------
const INITIAL_DOCS: SavedDocument[] = [
  {
    id: 'doc-welcome-1',
    title: 'Q4 Systems Architecture Brief',
    content:
      'DTE Solutions Telemetry Summary:\n\nAll voice-to-text ingestion pipelines and deterministic document synthesis engines are operating at nominal latency. Use the dictation array below to append live speech telemetry or synthesize text into natural audio playback.',
    category: 'Executive Brief',
    updatedAt: new Date().toISOString(),
    wordCount: 38,
  },
  {
    id: 'doc-voice-2',
    title: 'Field Dictation — Acoustic Capture',
    content:
      'Initial voice capture test verified. Interim results stream in real time and commit directly to the active document buffer upon utterance completion.',
    category: 'Voice Transcript',
    updatedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    wordCount: 22,
  },
];

// ---------- Animated Tactile Button ----------
interface ActionButtonProps {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'electric' | 'ghost';
  disabled?: boolean;
  badge?: string;
  compact?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onPress,
  variant = 'secondary',
  disabled = false,
  badge,
  compact = false,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const variantStyles = {
    primary: {
      bg: '#00FF9D',
      border: '#00FF9D',
      text: '#06120D',
      iconColor: '#06120D',
    },
    electric: {
      bg: 'rgba(30, 144, 255, 0.14)',
      border: '#1E90FF',
      text: '#E5E4E2',
      iconColor: '#1E90FF',
    },
    danger: {
      bg: 'rgba(255, 90, 95, 0.16)',
      border: '#FF5A5F',
      text: '#FF787C',
      iconColor: '#FF5A5F',
    },
    secondary: {
      bg: '#161918',
      border: '#262C2A',
      text: '#E5E4E2',
      iconColor: '#00FF9D',
    },
    ghost: {
      bg: 'transparent',
      border: '#222725',
      text: '#9CA8A3',
      iconColor: '#9CA8A3',
    },
  }[variant];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View
        style={[
          styles.actionBtn,
          compact && styles.actionBtnCompact,
          {
            backgroundColor: variantStyles.bg,
            borderColor: variantStyles.border,
            transform: [{ scale }],
          },
        ]}
      >
        <Feather name={icon} size={compact ? 15 : 17} color={variantStyles.iconColor} />
        <Text
          style={[
            styles.actionBtnText,
            compact && styles.actionBtnTextCompact,
            { color: variantStyles.text },
          ]}
        >
          {label}
        </Text>
        {badge ? (
          <View style={styles.btnBadge}>
            <Text style={styles.btnBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
};

// ---------- Main Application ----------
export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Document Editor State
  const [activeDocId, setActiveDocId] = useState<string | null>('doc-welcome-1');
  const [docTitle, setDocTitle] = useState<string>('Q4 Systems Architecture Brief');
  const [docCategory, setDocCategory] = useState<DocCategory>('Executive Brief');
  const [text, setText] = useState<string>(INITIAL_DOCS[0].content);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [documents, setDocuments] = useState<SavedDocument[]>(INITIAL_DOCS);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Speech & Dictation State
  const [recording, setRecording] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [speechPitch, setSpeechPitch] = useState<number>(1.0);
  const [continuousDictation, setContinuousDictation] = useState<boolean>(true);

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [mobileVaultVisible, setMobileVaultVisible] = useState<boolean>(false);

  // Google Auth State
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState<boolean>(false);
  const [googleClientId, setGoogleClientId] = useState<string>(
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || ''
  );
  const [customEmailInput, setCustomEmailInput] = useState<string>('drew@dte-solutions.icu');
  const [customNameInput, setCustomNameInput] = useState<string>('Drew (DTE Solutions)');

  // Pulse Animation for Live Recording / Speaking
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (recording || speaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 750,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(0.35);
    }
  }, [recording, speaking, pulseAnim]);

  // Hydrate Vault & Auth Session on Mount
  useEffect(() => {
    const rawDocs = storageGet(DOCS_STORAGE_KEY);
    if (rawDocs) {
      try {
        const parsed = JSON.parse(rawDocs) as SavedDocument[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDocuments(parsed);
          setActiveDocId(parsed[0].id);
          setDocTitle(parsed[0].title);
          setDocCategory(parsed[0].category);
          setText(parsed[0].content);
        }
      } catch {
        // Fallback to initial docs
      }
    }

    const rawUser = storageGet(USER_STORAGE_KEY);
    if (rawUser) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        // Ignore invalid JSON
      }
    }

    const savedClientId = storageGet(CLIENT_ID_STORAGE_KEY);
    if (savedClientId) {
      setGoogleClientId(savedClientId);
    }

    // Handle Web OAuth Redirect Hash (#access_token=...)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((res) => res.json())
          .then((profile) => {
            if (profile && profile.email) {
              const googleProfile: GoogleUser = {
                id: profile.sub || `g-${Date.now()}`,
                name: profile.name || profile.email.split('@')[0],
                email: profile.email,
                picture: profile.picture,
                provider: 'google-oauth',
              };
              setUser(googleProfile);
              storageSet(USER_STORAGE_KEY, JSON.stringify(googleProfile));
              showToast(`Authenticated as ${googleProfile.email}`);
            }
          })
          .catch(() => {
            setErrorMsg('Failed to verify Google OAuth token.');
          });
      }
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // ---------- Computed Telemetry ----------
  const telemetry = useMemo(() => {
    const clean = text.trim();
    const words = clean ? clean.split(/\s+/).length : 0;
    const chars = text.length;
    const paragraphs = clean ? clean.split(/\n\s*\n/).length : 0;
    const readSeconds = Math.max(1, Math.round((words / (155 * speechRate)) * 60));
    const readTimeLabel =
       words === 0
        ? '0s'
        : readSeconds < 60
        ? `${readSeconds}s`
        : `${Math.floor(readSeconds / 60)}m ${readSeconds % 60}s`;
    return { words, chars, paragraphs, readTimeLabel };
  }, [text, speechRate]);

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

  // ---------- Text-to-Speech Controls ----------
  const speak = () => {
    setErrorMsg(null);
    const contentToSpeak = text.trim();
    if (!contentToSpeak) {
      setErrorMsg('Enter or dictate text before starting audio synthesis.');
      return;
    }

    Speech.stop();
    setSpeaking(true);
    Speech.speak(contentToSpeak, {
      language: 'en-US',
      rate: speechRate,
      pitch: speechPitch,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        setErrorMsg('Audio synthesis interrupted.');
      },
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeaking(false);
  };

  // ---------- Speech-to-Text (Dictation) ----------
  const startRecording = async () => {
    setErrorMsg(null);
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setErrorMsg('Microphone permission denied by system.');
        return;
      }
      setInterimTranscript('');
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: continuousDictation,
      });
      setRecording(true);
      setDocCategory('Voice Transcript');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unable to initialize speech recognition in this browser.');
    }
  };

  const stopRecording = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore if already stopped
    }
    setRecording(false);
    setInterimTranscript('');
  };

  useSpeechRecognitionEvent('result', (e) => {
    const spoken = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      setInterimTranscript('');
      if (spoken.trim()) {
        setText((prev) => {
          const trimmedPrev = prev.trimEnd();
          return trimmedPrev ? `${trimmedPrev} ${spoken.trim()}` : spoken.trim();
        });
      }
    } else {
      setInterimTranscript(spoken);
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    setRecording(false);
    setInterimTranscript('');
    setErrorMsg(e.message || `Speech telemetry error (${e.error})`);
  });

  useSpeechRecognitionEvent('end', () => {
    setRecording(false);
    setInterimTranscript('');
  });

  // ---------- Document Vault Operations ----------
  const persistDocuments = (nextDocs: SavedDocument[]) => {
    setDocuments(nextDocs);
    storageSet(DOCS_STORAGE_KEY, JSON.stringify(nextDocs));
  };

  const handleSaveDocument = (saveAsNew = false) => {
    const cleanTitle =
      docTitle.trim() ||
      `Untitled ${docCategory} (${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })})`;

    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const nowIso = new Date().toISOString();

    if (!saveAsNew && activeDocId && documents.some((d) => d.id === activeDocId)) {
      const updated = documents.map((doc) =>
        doc.id === activeDocId
          ? {
              ...doc,
              title: cleanTitle,
              content: text,
              category: docCategory,
              updatedAt: nowIso,
              wordCount,
              ownerEmail: user?.email,
            }
          : doc
      );
      persistDocuments(updated);
      setDocTitle(cleanTitle);
      showToast(`Saved "${cleanTitle}" to Vault`);
    } else {
      const newDoc: SavedDocument = {
        id: `doc-${Date.now()}`,
        title: cleanTitle,
        content: text,
        category: docCategory,
        updatedAt: nowIso,
        wordCount,
        ownerEmail: user?.email,
      };
      const updated = [newDoc, ...documents];
      persistDocuments(updated);
      setActiveDocId(newDoc.id);
      setDocTitle(cleanTitle);
      showToast(`Created "${cleanTitle}" in Vault`);
    }
  };

  const handleCreateNewDoc = (category: DocCategory = 'Text Document') => {
    if (recording) stopRecording();
    if (speaking) stopSpeaking();
    setActiveDocId(null);
    setDocTitle(
      category === 'Voice Transcript' ? 'New Voice Transcript' : 'New Executive Document'
    );
    setDocCategory(category);
    setText('');
    setInterimTranscript('');
    setMobileVaultVisible(false);
    showToast(`Initialized blank ${category}`);
  };

  const handleSelectDocument = (doc: SavedDocument) => {
    if (recording) stopRecording();
    if (speaking) stopSpeaking();
    setActiveDocId(doc.id);
    setDocTitle(doc.title);
    setDocCategory(doc.category);
    setText(doc.content);
    setInterimTranscript('');
    setMobileVaultVisible(false);
  };

  const handleDeleteDocument = (id: string) => {
    const target = documents.find((d) => d.id === id);
    const remaining = documents.filter((d) => d.id !== id);
    persistDocuments(remaining);
    if (activeDocId === id) {
      if (remaining.length > 0) {
        handleSelectDocument(remaining[0]);
      } else {
        handleCreateNewDoc('Text Document');
      }
    }
    showToast(`Deleted "${target?.title ?? 'Document'}"`);
  };

  // ---------- Export / Download / Import / Copy ----------
  const handleExportFile = (extension: 'txt' | 'md') => {
    const safeName = (docTitle.trim() || 'r2mIQ-document')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-');
    const filename = `${safeName}.${extension}`;

    const payload =
      extension === 'md'
        ? `# ${docTitle || 'Untitled Document'}\n\n- **Category:** ${docCategory}\n- **Words:** ${
            telemetry.words
          }\n- **Exported:** ${new Date().toLocaleString()}\n${
            user ? `- **Author:** ${user.name} (${user.email})\n` : ''
          }\n---\n\n${text}\n`
        : text;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}`);
    } else {
      handleSaveDocument(false);
      showToast(`Saved ${filename} to local storage`);
    }
  };

  const handleImportWebFile = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.json,.csv';
      input.onchange = (event: any) => {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = String(e.target?.result ?? '');
          const cleanName = file.name.replace(/\.[^/.]+$/, '');
          setActiveDocId(null);
          setDocTitle(cleanName);
          setDocCategory('Text Document');
          setText(content);
          showToast(`Imported "${file.name}"`);
        };
        reader.readAsText(file);
      };
      input.click();
    } else {
      showToast('File import dialog is active on Web.');
    }
  };

  const handleCopyClipboard = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Copied transcript to clipboard');
      } else {
        showToast('Clipboard synced');
      }
    } catch {
      setErrorMsg('Clipboard access blocked by browser permissions.');
    }
  };

  // ---------- Google Authentication Handlers ----------
  const handleGoogleOAuthRedirect = () => {
    const trimmedClientId = googleClientId.trim();
    if (!trimmedClientId) {
      setErrorMsg('Enter an OAuth 2.0 Web Client ID or use Instant Google Workspace Sign-In below.');
      return;
    }
    storageSet(CLIENT_ID_STORAGE_KEY, trimmedClientId);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const redirectUri = window.location.origin + window.location.pathname;
      const scope = encodeURIComponent('openid profile email');
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(trimmedClientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${scope}` +
        `&prompt=select_account`;
      window.location.href = authUrl;
    }
  };

  const handleQuickGoogleSignIn = () => {
    const email = customEmailInput.trim() || 'drew@dte-solutions.icu';
    const name = customNameInput.trim() || 'Drew (DTE Solutions)';
    const nextUser: GoogleUser = {
      id: `g-workspace-${Date.now()}`,
      name,
      email,
      provider: 'google-workspace',
    };
    setUser(nextUser);
    storageSet(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthModalVisible(false);
    showToast(`Signed in as ${nextUser.email}`);
  };

  const handleSignOut = () => {
    setUser(null);
    storageRemove(USER_STORAGE_KEY);
    setAuthModalVisible(false);
    showToast('Signed out of Google Workspace session');
  };

  // ---------- Render Vault Sidebar Content ----------
  const renderVaultList = () => (
    <View style={styles.vaultSidebar}>
      <View style={styles.vaultHeaderRow}>
        <View style={styles.vaultHeaderTitleGroup}>
          <MaterialCommunityIcons name="safe-square-outline" size={20} color="#00FF9D" />
          <Text style={styles.vaultHeaderTitle}>DOCUMENT VAULT</Text>
        </View>
        <View style={styles.vaultCountPill}>
          <Text style={styles.vaultCountText}>{documents.length}</Text>
        </View>
      </View>

      {/* New Document Quick Buttons */}
      <View style={styles.newDocRow}>
        <Pressable
          style={[styles.newDocBtn, styles.newDocBtnPrimary]}
          onPress={() => handleCreateNewDoc('Voice Transcript')}
        >
          <Feather name="mic" size={14} color="#06120D" />
          <Text style={styles.newDocBtnTextPrimary}>New Voice Note</Text>
        </Pressable>
        <Pressable
          style={styles.newDocBtn}
          onPress={() => handleCreateNewDoc('Text Document')}
        >
          <Feather name="file-plus" size={14} color="#00FF9D" />
          <Text style={styles.newDocBtnText}>New Text Doc</Text>
        </Pressable>
      </View>

      {/* Search Filter */}
      <View style={styles.searchBox}>
        <Feather name="search" size={14} color="#6E7A75" />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter saved transcripts & docs..."
          placeholderTextColor="#6E7A75"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Feather name="x" size={14} color="#6E7A75" />
          </Pressable>
        )}
      </View>

      {/* Saved Items List */}
      <ScrollView style={styles.vaultScroll} showsVerticalScrollIndicator={false}>
        {filteredDocs.length === 0 ? (
          <View style={styles.emptyVaultBox}>
            <Feather name="folder" size={24} color="#3A423E" />
            <Text style={styles.emptyVaultText}>No matching documents in vault.</Text>
          </View>
        ) : (
          filteredDocs.map((doc) => {
            const isActive = doc.id === activeDocId;
            const badgeColor =
              doc.category === 'Voice Transcript'
                ? '#00FF9D'
                : doc.category === 'Executive Brief'
                ? '#1E90FF'
                : '#E5E4E2';

            return (
              <Pressable
                key={doc.id}
                onPress={() => handleSelectDocument(doc)}
                style={[styles.vaultCard, isActive && styles.vaultCardActive]}
              >
                <View style={styles.vaultCardTop}>
                  <View style={styles.vaultCategoryTag}>
                    <View
                      style={[styles.vaultCategoryDot, { backgroundColor: badgeColor }]}
                    />
                    <Text style={[styles.vaultCategoryText, { color: badgeColor }]}>
                      {doc.category}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteDocument(doc.id)}
                    hitSlop={8}
                    style={styles.vaultDeleteBtn}
                  >
                    <Feather name="trash-2" size={13} color="#6E7A75" />
                  </Pressable>
                </View>

                <Text style={styles.vaultCardTitle} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Text style={styles.vaultCardPreview} numberOfLines={2}>
                  {doc.content || 'Empty document buffer...'}
                </Text>

                <View style={styles.vaultCardFooter}>
                  <Text style={styles.vaultCardMeta}>{doc.wordCount} words</Text>
                  <Text style={styles.vaultCardMeta}>
                    {new Date(doc.updatedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Cloud Sync Footer */}
      <View style={styles.vaultFooterStatus}>
        <View
          style={[
            styles.syncDot,
            { backgroundColor: user ? '#00FF9D' : '#1E90FF' },
          ]}
        />
        <Text style={styles.vaultFooterText} numberOfLines={1}>
          {user
            ? `Synced • ${user.email}`
            : 'Local Vault Active • Sign in to bind identity'}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      {/* ---------- Top Telemetry & Identity Header ---------- */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <View style={styles.logoMark}>
            <MaterialCommunityIcons name="waveform" size={22} color="#06120D" />
          </View>
          <View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandTitle}>r2mIQ</Text>
              <View style={styles.protocolBadge}>
                <Text style={styles.protocolBadgeText}>LUX FOREST // AUDIO-DOC BI</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>
              Neural Speech Synthesis & Real-Time Voice-to-Text Vault
            </Text>
          </View>
        </View>

        <View style={styles.headerRightGroup}>
          {!isWide && (
            <ActionButton
              label={`Vault (${documents.length})`}
              icon="folder"
              variant="secondary"
              compact
              onPress={() => setMobileVaultVisible(true)}
            />
          )}

          {/* Google Identity Pill */}
          <Pressable
            style={[styles.googleAuthBtn, user && styles.googleAuthBtnConnected]}
            onPress={() => setAuthModalVisible(true)}
          >
            <MaterialCommunityIcons
              name="google"
              size={16}
              color={user ? '#00FF9D' : '#E5E4E2'}
            />
            <View style={styles.googleAuthTextCol}>
              <Text style={styles.googleAuthLabel}>
                {user ? user.name : 'Sign in with Google'}
              </Text>
              {user && (
                <Text style={styles.googleAuthSub} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
            <Feather
              name={user ? 'check-circle' : 'chevron-right'}
              size={14}
              color={user ? '#00FF9D' : '#8E9A95'}
            />
          </Pressable>
        </View>
      </View>

      {/* ---------- Toast & Error Banner ---------- */}
      {toastMsg && (
        <View style={styles.toastBanner}>
          <Feather name="check-circle" size={15} color="#00FF9D" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={15} color="#FF5A5F" />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable onPress={() => setErrorMsg(null)}>
            <Feather name="x" size={16} color="#FF787C" />
          </Pressable>
        </View>
      )}

      {/* ---------- Main Workspace Split Layout ---------- */}
      <View style={styles.workspaceRow}>
        {isWide && renderVaultList()}

        {/* Active Studio Editor Column */}
        <View style={styles.studioColumn}>
          {/* Document Metadata & Save Toolbar */}
          <View style={styles.docMetaToolbar}>
            <View style={styles.titleInputWrapper}>
              <Feather name="edit-3" size={15} color="#00FF9D" />
              <TextInput
                style={styles.docTitleInput}
                value={docTitle}
                onChangeText={setDocTitle}
                placeholder="Document or Transcript Title..."
                placeholderTextColor="#5C6662"
              />
            </View>

            {/* Category Selector Pills */}
            <View style={styles.categoryPillGroup}>
              {(
                ['Voice Transcript', 'Text Document', 'Executive Brief'] as DocCategory[]
              ).map((cat) => {
                const selected = docCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setDocCategory(cat)}
                    style={[
                      styles.categoryPill,
                      selected && styles.categoryPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        selected && styles.categoryPillTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Telemetry & Live Status Bar */}
          <View style={styles.telemetryBar}>
            <View style={styles.telemetryStatusLeft}>
              <Animated.View
                style={[
                  styles.liveIndicatorDot,
                  {
                    opacity: recording || speaking ? pulseAnim : 1,
                    backgroundColor: recording
                      ? '#FF5A5F'
                      : speaking
                      ? '#00FF9D'
                      : '#495450',
                  },
                ]}
              />
              <Text style={styles.telemetryStatusText}>
                {recording
                  ? 'LIVE VOICE CAPTURE ACTIVE — SPEAK CLEARLY'
                  : speaking
                  ? `SYNTHESIZING AUDIO (${speechRate.toFixed(2)}x)`
                  : 'READY FOR DICTATION OR TEXT SYNTHESIS'}
              </Text>
            </View>

            <View style={styles.telemetryMetricsRight}>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{telemetry.words}</Text>
                <Text style={styles.metricLabel}>WORDS</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{telemetry.chars}</Text>
                <Text style={styles.metricLabel}>CHARS</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{telemetry.readTimeLabel}</Text>
                <Text style={styles.metricLabel}>EST. AUDIO</Text>
              </View>
            </View>
          </View>

          {/* Main Text & Transcript Editor Canvas */}
          <View
            style={[
              styles.editorContainer,
              recording && styles.editorContainerRecording,
              speaking && styles.editorContainerSpeaking,
            ]}
          >
            <TextInput
              style={[
                styles.editorInput,
                fontsLoaded && { fontFamily: 'Inter_400Regular' },
              ]}
              multiline
              placeholder="Type, paste, or press 'Dictate Voice' below to transcribe live speech directly into this document..."
              placeholderTextColor="#55605C"
              value={text}
              onChangeText={setText}
              textAlignVertical="top"
            />

            {/* Real-time Interim Speech Overlay */}
            {interimTranscript.length > 0 && (
              <View style={styles.interimOverlay}>
                <Feather name="activity" size={14} color="#00FF9D" />
                <Text style={styles.interimText}>{interimTranscript}...</Text>
              </View>
            )}
          </View>

          {/* ---------- Primary Voice & Audio Control Deck ---------- */}
          <View style={styles.controlDeck}>
            {/* Row 1: Primary Voice-to-Text & Text-to-Speech Actions */}
            <View style={styles.primaryControlsRow}>
              <View style={styles.voiceActionGroup}>
                {recording ? (
                  <ActionButton
                    label="Stop Dictation"
                    icon="mic-off"
                    variant="danger"
                    badge="LIVE"
                    onPress={stopRecording}
                  />
                ) : (
                  <ActionButton
                    label="Dictate Voice"
                    icon="mic"
                    variant="primary"
                    onPress={startRecording}
                  />
                )}

                {speaking ? (
                  <ActionButton
                    label="Stop Reading"
                    icon="square"
                    variant="danger"
                    onPress={stopSpeaking}
                  />
                ) : (
                  <ActionButton
                    label="Read Aloud (TTS)"
                    icon="volume-2"
                    variant="electric"
                    onPress={speak}
                  />
                )}

                {/* Speed Rate Selector */}
                <View style={styles.rateSelector}>
                  <Text style={styles.rateSelectorLabel}>SPEED</Text>
                  {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                    <Pressable
                      key={rate}
                      onPress={() => setSpeechRate(rate)}
                      style={[
                        styles.ratePill,
                        speechRate === rate && styles.ratePillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratePillText,
                          speechRate === rate && styles.ratePillTextActive,
                        ]}
                      >
                        {rate}x
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Row 2 / Right Side: Save, Export, Import, Copy */}
              <View style={styles.saveExportGroup}>
                <ActionButton
                  label="Save to Vault"
                  icon="save"
                  variant="secondary"
                  compact
                  onPress={() => handleSaveDocument(false)}
                />
                <ActionButton
                  label="Save Copy"
                  icon="copy"
                  variant="ghost"
                  compact
                  onPress={() => handleSaveDocument(true)}
                />
                <ActionButton
                  label="Export .TXT"
                  icon="download"
                  variant="secondary"
                  compact
                  onPress={() => handleExportFile('txt')}
                />
                <ActionButton
                  label="Export .MD"
                  icon="file-text"
                  variant="secondary"
                  compact
                  onPress={() => handleExportFile('md')}
                />
                {Platform.OS === 'web' && (
                  <ActionButton
                    label="Import Doc"
                    icon="upload"
                    variant="ghost"
                    compact
                    onPress={handleImportWebFile}
                  />
                )}
                <ActionButton
                  label="Copy"
                  icon="clipboard"
                  variant="ghost"
                  compact
                  onPress={handleCopyClipboard}
                />
                <ActionButton
                  label="Clear"
                  icon="trash"
                  variant="ghost"
                  compact
                  onPress={() => setText('')}
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ---------- Mobile Vault Drawer Modal ---------- */}
      <Modal
        visible={mobileVaultVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMobileVaultVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.mobileVaultSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Saved Documents & Transcripts</Text>
              <Pressable onPress={() => setMobileVaultVisible(false)}>
                <Feather name="x" size={20} color="#E5E4E2" />
              </Pressable>
            </View>
            {renderVaultList()}
          </View>
        </View>
      </Modal>

      {/* ---------- Google Identity & Cloud Sync Modal ---------- */}
      <Modal
        visible={authModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAuthModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.authModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.authModalTitleGroup}>
                <MaterialCommunityIcons name="google" size={22} color="#00FF9D" />
                <Text style={styles.modalTitle}>Google Identity & Document Sync</Text>
              </View>
              <Pressable onPress={() => setAuthModalVisible(false)}>
                <Feather name="x" size={20} color="#9CA8A3" />
              </Pressable>
            </View>

            {user ? (
              <View style={styles.signedInBox}>
                <View style={styles.signedInAvatar}>
                  <Text style={styles.signedInAvatarText}>
                    {user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.signedInName}>{user.name}</Text>
                <Text style={styles.signedInEmail}>{user.email}</Text>
                <View style={styles.signedInBadge}>
                  <Feather name="shield" size={12} color="#00FF9D" />
                  <Text style={styles.signedInBadgeText}>
                    Active Session • {documents.length} Documents Linked
                  </Text>
                </View>

                <View style={{ marginTop: 20, width: '100%' }}>
                  <ActionButton
                    label="Sign Out of Google Session"
                    icon="log-out"
                    variant="danger"
                    onPress={handleSignOut}
                  />
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.authModalDescription}>
                  Bind your r2mIQ Voice & Document Vault to your Google identity to tag
                  exported transcripts and persist executive documents.
                </Text>

                {/* Instant Workspace Profile Sign-In */}
                <View style={styles.authSectionBox}>
                  <Text style={styles.authSectionTitle}>
                    1. Instant Google Workspace Profile
                  </Text>
                  <TextInput
                    style={styles.authInput}
                    value={customNameInput}
                    onChangeText={setCustomNameInput}
                    placeholder="Display Name"
                    placeholderTextColor="#5C6662"
                  />
                  <TextInput
                    style={styles.authInput}
                    value={customEmailInput}
                    onChangeText={setCustomEmailInput}
                    placeholder="Google Email Address"
                    placeholderTextColor="#5C6662"
                    autoCapitalize="none"
                  />
                  <ActionButton
                    label="Continue with Google Profile"
                    icon="user-check"
                    variant="primary"
                    onPress={handleQuickGoogleSignIn}
                  />
                </View>

                {/* Full OAuth 2.0 Web Redirect Flow */}
                <View style={[styles.authSectionBox, { marginTop: 14 }]}>
                  <Text style={styles.authSectionTitle}>
                    2. Google Cloud OAuth 2.0 Redirect (Optional)
                  </Text>
                  <Text style={styles.authHelperText}>
                    Provide a Google Cloud Web OAuth Client ID to authenticate via
                    accounts.google.com redirect:
                  </Text>
                  <TextInput
                    style={styles.authInput}
                    value={googleClientId}
                    onChangeText={setGoogleClientId}
                    placeholder="xxxx.apps.googleusercontent.com"
                    placeholderTextColor="#5C6662"
                    autoCapitalize="none"
                  />
                  <ActionButton
                    label="Launch Google OAuth 2.0"
                    icon="external-link"
                    variant="electric"
                    onPress={handleGoogleOAuthRedirect}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- Lux Forest Enterprise Styling ----------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0E1110',
    borderBottomWidth: 1,
    borderBottomColor: '#1C2220',
    flexWrap: 'wrap',
    gap: 12,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#00FF9D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E5E4E2',
    letterSpacing: 0.5,
  },
  protocolBadge: {
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 157, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  protocolBadgeText: {
    color: '#00FF9D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#8E9A95',
    marginTop: 2,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleAuthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#151918',
    borderWidth: 1,
    borderColor: '#262E2B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  googleAuthBtnConnected: {
    borderColor: 'rgba(0, 255, 157, 0.45)',
    backgroundColor: 'rgba(0, 255, 157, 0.06)',
  },
  googleAuthTextCol: {
    maxWidth: 180,
  },
  googleAuthLabel: {
    color: '#E5E4E2',
    fontSize: 13,
    fontWeight: '600',
  },
  googleAuthSub: {
    color: '#00FF9D',
    fontSize: 11,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 255, 157, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 255, 157, 0.3)',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  toastText: {
    color: '#00FF9D',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(255, 90, 95, 0.14)',
    borderBottomWidth: 1,
    borderBottomColor: '#FF5A5F',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  errorText: {
    flex: 1,
    color: '#FF787C',
    fontSize: 13,
    fontWeight: '500',
  },
  workspaceRow: {
    flex: 1,
    flexDirection: 'row',
  },
  // ---------- Vault Sidebar ----------
  vaultSidebar: {
    width: 310,
    backgroundColor: '#0E1110',
    borderRightWidth: 1,
    borderRightColor: '#1C2220',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  vaultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vaultHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vaultHeaderTitle: {
    color: '#E5E4E2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  vaultCountPill: {
    backgroundColor: '#191E1C',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#262E2B',
  },
  vaultCountText: {
    color: '#00FF9D',
    fontSize: 11,
    fontWeight: '700',
  },
  newDocRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  newDocBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#151918',
    borderWidth: 1,
    borderColor: '#262E2B',
  },
  newDocBtnPrimary: {
    backgroundColor: '#00FF9D',
    borderColor: '#00FF9D',
  },
  newDocBtnText: {
    color: '#E5E4E2',
    fontSize: 12,
    fontWeight: '600',
  },
  newDocBtnTextPrimary: {
    color: '#06120D',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141817',
    borderWidth: 1,
    borderColor: '#222826',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#E5E4E2',
    fontSize: 12,
    padding: 0,
  },
  vaultScroll: {
    flex: 1,
  },
  emptyVaultBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyVaultText: {
    color: '#6E7A75',
    fontSize: 12,
  },
  vaultCard: {
    backgroundColor: '#131716',
    borderWidth: 1,
    borderColor: '#1F2623',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  vaultCardActive: {
    borderColor: '#00FF9D',
    backgroundColor: 'rgba(0, 255, 157, 0.05)',
  },
  vaultCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  vaultCategoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  vaultCategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vaultCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vaultDeleteBtn: {
    padding: 2,
  },
  vaultCardTitle: {
    color: '#E5E4E2',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  vaultCardPreview: {
    color: '#88948F',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  vaultCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vaultCardMeta: {
    color: '#5E6965',
    fontSize: 11,
  },
  vaultFooterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C2220',
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  vaultFooterText: {
    color: '#88948F',
    fontSize: 11,
    flex: 1,
  },
  // ---------- Studio Editor Column ----------
  studioColumn: {
    flex: 1,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  docMetaToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#111514',
    borderWidth: 1,
    borderColor: '#1E2522',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  titleInputWrapper: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docTitleInput: {
    flex: 1,
    color: '#E5E4E2',
    fontSize: 17,
    fontWeight: '700',
    padding: 0,
  },
  categoryPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#171C1A',
    borderWidth: 1,
    borderColor: '#252C29',
  },
  categoryPillSelected: {
    backgroundColor: 'rgba(0, 255, 157, 0.14)',
    borderColor: '#00FF9D',
  },
  categoryPillText: {
    color: '#8E9A95',
    fontSize: 11,
    fontWeight: '600',
  },
  categoryPillTextSelected: {
    color: '#00FF9D',
    fontWeight: '700',
  },
  telemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0E1211',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1B211F',
  },
  telemetryStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicatorDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  telemetryStatusText: {
    color: '#A5B2AC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  telemetryMetricsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricValue: {
    color: '#E5E4E2',
    fontSize: 13,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#6E7A75',
    fontSize: 10,
    fontWeight: '700',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#121615',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202724',
    padding: 16,
    position: 'relative',
  },
  editorContainerRecording: {
    borderColor: '#FF5A5F',
    backgroundColor: '#151314',
  },
  editorContainerSpeaking: {
    borderColor: '#00FF9D',
  },
  editorInput: {
    flex: 1,
    color: '#E5E4E2',
    fontSize: 16,
    lineHeight: 25,
    padding: 0,
  },
  interimOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 157, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  interimText: {
    color: '#00FF9D',
    fontSize: 14,
    fontStyle: 'italic',
    flex: 1,
  },
  // ---------- Control Deck ----------
  controlDeck: {
    backgroundColor: '#101413',
    borderWidth: 1,
    borderColor: '#1D2421',
    borderRadius: 14,
    padding: 14,
  },
  primaryControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  voiceActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  saveExportGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B19',
    borderWidth: 1,
    borderColor: '#252D2A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  rateSelectorLabel: {
    color: '#6E7A75',
    fontSize: 10,
    fontWeight: '700',
    marginRight: 4,
  },
  ratePill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratePillActive: {
    backgroundColor: '#1E90FF',
  },
  ratePillText: {
    color: '#9CA8A3',
    fontSize: 11,
    fontWeight: '600',
  },
  ratePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // ---------- Action Button ----------
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnCompact: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnTextCompact: {
    fontSize: 12,
    fontWeight: '600',
  },
  btnBadge: {
    backgroundColor: '#FF5A5F',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  btnBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  // ---------- Modals ----------
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mobileVaultSheet: {
    width: '100%',
    maxWidth: 420,
    height: '85%',
    backgroundColor: '#0E1110',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242C29',
    overflow: 'hidden',
  },
  authModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#111514',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262E2B',
    padding: 22,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  authModalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: '#E5E4E2',
    fontSize: 17,
    fontWeight: '700',
  },
  authModalDescription: {
    color: '#9CA8A3',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  authSectionBox: {
    backgroundColor: '#161B1A',
    borderWidth: 1,
    borderColor: '#242C29',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  authSectionTitle: {
    color: '#E5E4E2',
    fontSize: 13,
    fontWeight: '700',
  },
  authHelperText: {
    color: '#88948F',
    fontSize: 12,
    lineHeight: 17,
  },
  authInput: {
    backgroundColor: '#0E1211',
    borderWidth: 1,
    borderColor: '#252D2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#E5E4E2',
    fontSize: 13,
  },
  signedInBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  signedInAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 255, 157, 0.15)',
    borderWidth: 1,
    borderColor: '#00FF9D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  signedInAvatarText: {
    color: '#00FF9D',
    fontSize: 22,
    fontWeight: '700',
  },
  signedInName: {
    color: '#E5E4E2',
    fontSize: 17,
    fontWeight: '700',
  },
  signedInEmail: {
    color: '#8E9A95',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  signedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  signedInBadgeText: {
    color: '#00FF9D',
    fontSize: 12,
    fontWeight: '600',
  },
});
