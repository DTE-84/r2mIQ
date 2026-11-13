import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRecordings, type Recording } from '../state/recordings';
import { useDictation } from '../state/dictation';
import { RecordButton } from '../components/RecordButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { formatDate, formatDuration, wordCount } from '../lib/format';
import { colors, fonts } from '../theme';

export default function RecordingsScreen() {
  const insets = useSafeAreaInsets();
  const { recordings, loaded, create } = useRecordings();
  const dictation = useDictation();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter(
      (r) => r.title.toLowerCase().includes(q) || r.transcript.toLowerCase().includes(q)
    );
  }, [recordings, query]);

  const onRecordPress = () => {
    if (dictation.activeId) {
      // Already recording: jump back to it.
      router.push(`/recording/${dictation.activeId}`);
      return;
    }
    const rec = create();
    router.push(`/recording/${rec.id}`);
    dictation.start(rec.id);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <MaterialCommunityIcons name="waveform" size={22} color={colors.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>r2mIQ</Text>
          <Text style={styles.subtitle}>Record. Transcribe. Remember.</Text>
        </View>
      </View>

      <ErrorBanner message={dictation.error} onDismiss={dictation.clearError} />

      <View style={styles.search}>
        <Feather name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recordings"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <Feather name="x" size={16} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 140, gap: 10 }}
        renderItem={({ item }) => (
          <RecordingCard
            recording={item}
            live={item.id === dictation.activeId}
            liveMs={dictation.elapsedMs}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Feather name={query ? 'search' : 'mic'} size={28} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>{query ? 'No matches' : 'No recordings yet'}</Text>
              <Text style={styles.emptyText}>
                {query
                  ? 'Try a different word from the title or transcript.'
                  : 'Tap the button below to record a meeting, lecture or note. Each recording gets its own transcript.'}
              </Text>
            </View>
          ) : null
        }
      />

      <View style={[styles.recordDock, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <RecordButton
          recording={!!dictation.activeId}
          onPress={onRecordPress}
          label={dictation.activeId ? `Recording · ${formatDuration(dictation.elapsedMs)}` : 'New recording'}
        />
      </View>
    </View>
  );
}

function RecordingCard({ recording, live, liveMs }: { recording: Recording; live: boolean; liveMs: number }) {
  const words = wordCount(recording.transcript);
  return (
    <Pressable
      onPress={() => router.push(`/recording/${recording.id}`)}
      style={({ pressed }) => [styles.card, live && styles.cardLive, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {recording.title}
        </Text>
        {live && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardMeta}>
        {formatDate(recording.createdAt)} · {formatDuration(live ? liveMs : recording.durationMs)} · {words}{' '}
        {words === 1 ? 'word' : 'words'}
      </Text>
      <Text style={styles.cardPreview} numberOfLines={2}>
        {recording.transcript.trim() || (live ? 'Listening…' : 'No transcript yet')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.text, fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15, height: '100%' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  cardLive: { borderColor: colors.danger },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 16 },
  cardMeta: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 12 },
  cardPreview: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: colors.dangerSoft,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  liveText: { color: colors.danger, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  recordDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 16,
    backgroundColor: 'rgba(10,10,10,0.92)',
  },
});
