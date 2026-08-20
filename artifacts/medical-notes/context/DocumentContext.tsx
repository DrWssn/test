import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'medical-notes.document-id';

type DocumentContextValue = {
  documentId: string;
  hydrated: boolean;
  setDocumentId: (value: string) => Promise<void>;
  clearDocument: () => Promise<void>;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [documentId, setDocumentIdState] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      setDocumentIdState(stored || '');
      setHydrated(true);
    });
  }, []);

  const value = useMemo<DocumentContextValue>(() => ({
    documentId,
    hydrated,
    setDocumentId: async (value) => {
      const next = value.trim();
      setDocumentIdState(next);
      if (next) await AsyncStorage.setItem(STORAGE_KEY, next);
      else await AsyncStorage.removeItem(STORAGE_KEY);
    },
    clearDocument: async () => {
      setDocumentIdState('');
      await AsyncStorage.removeItem(STORAGE_KEY);
    },
  }), [documentId, hydrated]);

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

export function useDocument() {
  const value = useContext(DocumentContext);
  if (!value) throw new Error('useDocument must be used inside DocumentProvider');
  return value;
}