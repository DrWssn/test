import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GoogleApiError } from '@/lib/google/api';
import { AuthProvider } from '@/lib/google/auth';
import { SignInGate } from '@/lib/google/SignInGate';
import { OutboxProvider } from '@/lib/outbox';
import { DocumentProvider } from '@/context/DocumentContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Retry only failures that can succeed on a second try (network errors, 429, 5xx). Other 4xx errors
// (API disabled, no access, bad document ID) won't change, so show them right away.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = error instanceof GoogleApiError ? error.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 429) return false;
        return failureCount < 2;
      },
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <DocumentProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <AuthProvider>
                  <SignInGate>
                    <OutboxProvider>
                      <RootLayoutNav />
                    </OutboxProvider>
                  </SignInGate>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </DocumentProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
