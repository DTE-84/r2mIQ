import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { Feather } from '@expo/vector-icons';
import { useRecordings } from '../../state/recordings';
import { useDictation } from '../../state/dictation';
import { RecordButton } from '../../components/RecordButton';
import { ErrorBanner } from '../../components/ErrorBanner';
import { formatDate, formatDuration, wordCount } from '../../lib/format';
import { copyText, shareText } from '../../lib/share';
import { confirm } from '../../lib/confirm';
import { colors, fonts } from '../../theme';

type Tab = 'summary' | 'transcript' | 'chat';

const TABS: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'summary', label: 'AI Summary', icon: 'align-left' },
  { key: 'transcript', label: 'Transcript', icon: 'file-text' },
  { key: 'chat', label: 'AI Chat', icon: 'message-circle' },
];

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function RecordingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { recordings, loaded, update, remove } = useRecordings();
  const dictation = useDictation();
  const recording = recordings.find((r) => r.id === id);

  const [tab, setTab] = useState<Tab>('transcript');
  const [speaking, setSpeaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLive = !!recording && dictation.activeId === recording.id;
  const otherIsLive = !!dictation.activeId && !isLive;

  useEffect(
    () => () => {
      Speech.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  if (!recording) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        {loaded && (
          <>
            <Text style={styles.emptyTitle}>Recording not found</Text>
            <Pressable onPress={() => router.replace('/')} style={styles.chip}>
              <Text style={styles.chipText}>Back to recordings</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const transcript = recording.transcript;
  const words = wordCount(transcript);

  const onCopy = async () => {
    if (!transcript.trim()) return showToast('Nothing to copy yet');
    try {
      await copyText(transcript);
      showToast('Transcript copied');
    } catch {
      showToast('Could not copy. Long-press the text instead.');
    }
  };

  const onShare = async () => {
    if (!transcript.trim()) return showToast('Nothing to share yet');
    const res = await shareText(recording.title, transcript).catch(() => 'dismissed' as const);
    if (res === 'copied') showToast('Copied to clipboard');
  };

  const onDelete = async () => {
    const ok = await confirm('Delete recording?', `"${recording.title}" will be removed from this device.`, 'Delete');
    if (!ok) return;
    if (isLive) dictation.stop();
    Speech.stop();
    remove(recording.id);
    goBack();
  };

  const onRecordPress = () => {
    if (isLive) dictation.stop();
    else if (otherIsLive) showToast('Another recording is in progress');
    else {
      Speech.stop();
      setSpeaking(false);
      setTab('transcript');
      dictation.start(recording.id);
    }
  };

  const onReadAloud = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!transcript.trim()) return showToast('Nothing to read yet');
    setSpeaking(true);
    Speech.speak(transcript, {
      language: 'en-US',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" label="Back" onPress={goBack} />
        <View style={{ flex: 1 }} />
        <IconButton icon="share" label="Share" onPress={onShare} />
        <IconButton icon="trash-2" label="Delete recording" onPress={onDelete} />
      </View>

      <ErrorBanner message={dictation.error} onDismiss={dictation.clearError} />

      {/* Title card with tabs */}
      <View style={styles.headerCard}>
        <TextInput
          style={styles.title}
          value={recording.title}
          onChangeText={(title) => update(recording.id, { title })}
          placeholder="Untitled recording"
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
        />
        <View style={styles.metaRow}>
          <Feather name="calendar" size={12} color={colors.textFaint} />
          <Text style={styles.meta}>{formatDate(recording.createdAt)}</Text>
          <Text style={styles.meta}>·</Text>
          <Feather name="clock" size={12} color={colors.textFaint} />
          <Text style={styles.meta}>{formatDuration(isLive ? dictation.elapsedMs : recording.durationMs)}</Text>
          <Text style={styles.meta}>·</Text>
          <Text style={styles.meta}>
            {words} {words === 1 ? 'word' : 'words'}
          </Text>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.tabInner}>
                  <Feather name={t.icon} size={14} color={active ? colors.text : colors.textFaint} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </View>
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {tab === 'transcript' && (
          <TranscriptTab
            transcript={transcript}
            interim={isLive ? dictation.interim : ''}
            live={isLive}
            onChange={(text) => update(recording.id, { transcript: text })}
            onCopy={onCopy}
            onShare={onShare}
          />
        )}
        {tab === 'summary' && (
          <ComingSoon
            icon="align-left"
            title="AI Summary"
            text="Key points, action items and a short overview of this recording. This is the next feature being built."
          />
        )}
        {tab === 'chat' && (
          <ComingSoon
            icon="message-circle"
            title="Ask AI about this recording"
            text={'Ask questions like "What did we decide about pricing?" and get answers from the transcript. Coming soon.'}
          />
        )}
      </View>

      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 110 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.dockSide}>
          <Text style={[styles.dockStatus, isLive && { color: colors.danger }]}>
            {isLive ? `● ${formatDuration(dictation.elapsedMs)}` : transcript.trim() ? 'Tap to add more' : 'Tap to record'}
          </Text>
        </View>
        <RecordButton recording={isLive} onPress={onRecordPress} size={60} />
        <View style={[styles.dockSide, { alignItems: 'flex-end' }]}>
          <Pressable onPress={onReadAloud} style={styles.chip} disabled={isLive}>
            <Feather name={speaking ? 'square' : 'volume-2'} size={14} color={isLive ? colors.textFaint : colors.accent} />
            <Text style={[styles.chipText, isLive && { color: colors.textFaint }]}>
              {speaking ? 'Stop' : 'Listen'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TranscriptTab({
  transcript,
  interim,
  live,
  onChange,
  onCopy,
  onShare,
}: {
  transcript: string;
  interim: string;
  live: boolean;
  onChange: (text: string) => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Transcript</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={onCopy} style={styles.chip} accessibilityLabel="Copy transcript">
            <Feather name="copy" size={14} color={colors.accent} />
            <Text style={styles.chipText}>Copy</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.chip} accessibilityLabel="Share transcript">
            <Feather name="share" size={14} color={colors.accent} />
            <Text style={styles.chipText}>Share</Text>
          </Pressable>
        </View>
      </View>

      {live ? (
        // While recording: read-only and selectable, with words in progress shown in green.
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.transcriptBody}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Text style={styles.transcriptText} selectable>
            {transcript}
            {interim ? (
              <Text style={styles.interimText}>
                {transcript ? ' ' : ''}
                {interim}
              </Text>
            ) : null}
            {!transcript && !interim ? <Text style={styles.placeholder}>Listening… start speaking.</Text> : null}
          </Text>
        </ScrollView>
      ) : (
        <TextInput
          style={[styles.transcriptText, styles.transcriptBody, styles.transcriptInput]}
          value={transcript}
          onChangeText={onChange}
          multiline
          textAlignVertical="top"
          placeholder="No transcript yet. Tap the record button to start, or type here."
          placeholderTextColor={colors.textFaint}
          scrollEnabled
        />
      )}
    </View>
  );
}

function ComingSoon({ icon, title, text }: { icon: keyof typeof Feather.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.comingSoon}>
      <View style={styles.comingSoonIcon}>
        <Feather name={icon} size={22} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
    >
      <Feather name={icon} size={19} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCard: {
    marginHorizontal: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 27, padding: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  meta: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 12 },
  tabs: { flexDirection: 'row', marginTop: 14 },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10 },
  tabText: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 13 },
  tabTextActive: { color: colors.text, fontFamily: fonts.semibold },
  tabUnderline: { height: 3, width: '70%', borderRadius: 2, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.accent },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: colors.accentSoft,
  },
  chipText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
  transcriptBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  transcriptInput: { flex: 1 },
  transcriptText: { color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 25 },
  interimText: { color: colors.accent, fontStyle: 'italic' },
  placeholder: { color: colors.textFaint },
  comingSoon: { flex: 1, alignItems: 'center', paddingTop: 56, paddingHorizontal: 36, gap: 10 },
  comingSoonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 4,
  },
  emptyTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastText: { color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  dockSide: { flex: 1 },
  dockStatus: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
});
