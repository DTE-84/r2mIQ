import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Feather name="alert-triangle" size={15} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <Feather name="x" size={16} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  text: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
});
