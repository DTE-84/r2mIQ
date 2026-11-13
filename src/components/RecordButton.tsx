import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

interface Props {
  recording: boolean;
  onPress: () => void;
  label?: string;
  size?: number;
}

/** Large round record / stop button with a pulsing ring while recording. */
export function RecordButton({ recording, onPress, label, size = 72 }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!recording) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const bg = recording ? colors.danger : colors.accent;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {recording && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: size / 2, backgroundColor: bg, opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
          )}
          <View style={[styles.button, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
            {recording ? (
              <View style={styles.stopSquare} />
            ) : (
              <Feather name="mic" size={size * 0.4} color={colors.accentInk} />
            )}
          </View>
        </View>
      </Pressable>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  stopSquare: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  label: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
});
