import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export type ShareResult = 'shared' | 'copied' | 'dismissed';

/** Open the system share sheet; where there is none (desktop web), copy instead. */
export async function shareText(title: string, body: string): Promise<ShareResult> {
  const message = `${title}\n\n${body}`.trim();
  const canWebShare =
    Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  if (canWebShare) {
    try {
      const res = await Share.share({ title, message });
      return res.action === Share.dismissedAction ? 'dismissed' : 'shared';
    } catch {
      // Fall through to copying.
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}

export const copyText = (text: string) => Clipboard.setStringAsync(text);
