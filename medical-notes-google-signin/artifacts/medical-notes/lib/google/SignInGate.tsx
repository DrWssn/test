import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './auth';

/** Shows a Google sign-in screen until the user grants Drive/Docs permission. */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { ready, email, error, signIn } = useAuth();

  if (!ready) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (email) return <>{children}</>;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Feather name="lock" size={36} color={colors.primary} />
      <Text style={[styles.title, { color: colors.foreground }]}>Sign in with Google</Text>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Medical Notes needs permission to read and edit your Google Docs and save images to your Drive.
      </Text>
      <Pressable
        onPress={signIn}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Continue with Google</Text>
      </Pressable>
      {error ? <Text style={[styles.text, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  text: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  button: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
