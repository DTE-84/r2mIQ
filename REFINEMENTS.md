# Optional Refinements for r2mIQ

Below are concrete code snippets you can copy‑paste into `App.tsx` (or a new component) to enable each optional feature.

---

## 1️⃣ Animated Button Feedback
```tsx
import { Pressable, Animated } from 'react-native';

const AnimatedButton = ({title, onPress, color}) => {
  const scale = React.useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Button title={title} onPress={onPress} color={color} />
      </Animated.View>
    </Pressable>
  );
};
```
Replace the `<Button>` elements in the `buttonRow` with `<AnimatedButton …>`.

---

## 2️⃣ Platinum‑styled Headings
The title already uses platinum (`#E5E4E2`). To apply it elsewhere:
```tsx
<Text style={{ color: '#E5E4E2', fontSize: 24, fontWeight: '600' }}>Your Heading</Text>
```
Add this style wherever you need a premium heading.

---

## 3️⃣ Electric‑Blue Accent Theme
Swap the primary colour constant:
```tsx
// In the StyleSheet section replace the button colour
button: { color: '#1E90FF' }, // electric‑blue
```
You can also change the placeholder accent line:
```tsx
input: { backgroundColor: '#1E1E1E', borderColor: '#1E90FF', borderWidth: 1 },
```
---

## 4️⃣ Persisted Notes (Supabase / Neon)
1. **Create a Supabase project** (or a Neon Postgres DB). Gather the `url` and `anonKey`.
2. Install the client:
   ```powershell
   npm install @supabase/supabase-js
   ```
3. Add a `supabase.ts` file:
```tsx
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_ANON_KEY');
```
4. Save / load notes:
```tsx
// Save
await supabase.from('notes').insert({ content: text, user_id: 'local' });
// Load on mount
const { data } = await supabase.from('notes').select('content').eq('user_id','local').single();
if (data) setText(data.content);
```
Create the table `notes(id uuid primary key default gen_random_uuid(), content text, user_id text)` in your DB.

---

## 5️⃣ Custom Fonts (Inter / Outfit)
```powershell
npm install expo-font @expo-google-fonts/inter
```
```tsx
import { useFonts, Inter_400Regular } from '@expo-google-fonts/inter';
const [fontsLoaded] = useFonts({ Inter_400Regular });
if (!fontsLoaded) return null; // or a loading spinner
```
Then set `fontFamily: 'Inter_400Regular'` in any style.

---

## 6️⃣ Micro‑Animations & Gradient Background
```tsx
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const gradientOpacity = useSharedValue(0.4);
const animatedStyle = useAnimatedStyle(() => ({
  opacity: withTiming(gradientOpacity.value, { duration: 2000 }),
}));

// In the component tree
<Animated.View style={[StyleSheet.absoluteFill, animatedStyle, { backgroundColor: '#0A0A0A' }]} />
```
Toggle `gradientOpacity.value` between `0.4` and `0.6` on a loop for a subtle pulsating effect.

---

## How to Enable a Feature
1. Open `App.tsx` in your editor.
2. Locate the **comment block** that mentions the feature you want.
3. Paste the snippet and adjust any identifiers (e.g., colour constants, Supabase URL).
4. Save and reload the app (`npm run start`).

Feel free to combine multiple refinements – they are independent.
