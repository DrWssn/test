import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Full Drive access is needed to list and edit Google Docs the app did not create.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

// The web client ID is optional: access tokens only need the Android OAuth client (package name + SHA-1).
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;

GoogleSignin.configure({
  ...(webClientId ? { webClientId } : {}),
  scopes: GOOGLE_SCOPES,
  offlineAccess: false,
});

// Play Services' DEVELOPER_ERROR: no Android OAuth client matches this APK's package name and SHA-1.
const DEVELOPER_ERROR = '10';

type AuthState = {
  ready: boolean;
  email: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Play Services' NETWORK_ERROR: the phone is offline, so the sign-in itself may still be valid.
const NETWORK_ERROR = '7';
const SESSION_EXPIRED = 'Your Google sign-in expired. Please sign in again.';

// Set by AuthProvider so token failures outside React can send the user back to the sign-in screen.
let onSessionExpired: (() => void) | null = null;

/** Returns a fresh Google access token for the signed-in user. Tokens never leave the phone except to Google. */
export async function getAccessToken(): Promise<string> {
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    if (accessToken) return accessToken;
  } catch (e) {
    if (isErrorWithCode(e) && String(e.code) === NETWORK_ERROR) throw e;
    // Anything else means the grant is gone: revoked, or expired (Google expires Testing-mode grants after 7 days).
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore: we only need the local sign-in state cleared.
  }
  onSessionExpired?.();
  throw new Error(SESSION_EXPIRED);
}

/** Drops a token Google rejected so the next getAccessToken() fetches a fresh one. */
export async function discardAccessToken(token: string): Promise<void> {
  await GoogleSignin.clearCachedAccessToken(token);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSessionExpired = () => {
      setEmail(null);
      setError(SESSION_EXPIRED);
    };
    return () => {
      onSessionExpired = null;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (GoogleSignin.hasPreviousSignIn()) {
          const res = await GoogleSignin.signInSilently();
          if (res.type === 'success') setEmail(res.data.user.email);
        }
      } catch {
        // Silent sign-in failed (e.g. permission revoked); show the sign-in screen.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (isSuccessResponse(res)) setEmail(res.data.user.email);
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.IN_PROGRESS) return;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services is not available on this phone.');
          return;
        }
        if (String(e.code) === DEVELOPER_ERROR) {
          setError(
            'Google sign-in is not set up for this APK (DEVELOPER_ERROR). Add an Android OAuth client for ' +
              'com.drwssn.medicalnotes with this APK\'s SHA-1 in Google Cloud Console.',
          );
          return;
        }
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
        setError(`Google sign-in failed (${e.code}). Check the OAuth client setup.`);
        return;
      }
      setError('Google sign-in failed.');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.revokeAccess();
    } catch {
      // Ignore: revoking can fail offline; sign out locally anyway.
    }
    await GoogleSignin.signOut();
    setEmail(null);
  }, []);

  const value = useMemo(() => ({ ready, email, error, signIn, signOut }), [ready, email, error, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
