// Notes are written to the phone before they are sent, so nothing is lost when there's no signal.
// Unsent notes are retried in order: on launch, when the app comes back to the foreground, and every 30 s.
import { useQueryClient } from '@tanstack/react-query';
import { Directory, File, Paths } from 'expo-file-system';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isRetryableError, submitNote, type SubmitNoteInput, type SubmitNoteResult } from './google/api';
import { getGetDocumentQueryKey } from './google/hooks';

export type OutboxItem = {
  id: string;
  createdAt: string;
  input: SubmitNoteInput;
  /** Last error while sending. */
  error?: string;
  /** Sending failed in a way retrying won't fix (e.g. the document was deleted); waits for the user. */
  failed?: boolean;
};

export type SendOutcome =
  | { status: 'sent'; result: SubmitNoteResult }
  | { status: 'queued'; error?: string }
  | { status: 'failed'; error: string };

// Files, not AsyncStorage: a note can carry a base64 image of several MB, above Android's AsyncStorage row limit.
const outboxDir = new Directory(Paths.document, 'outbox');

function readAll(): OutboxItem[] {
  if (!outboxDir.exists) return [];
  const items: OutboxItem[] = [];
  for (const entry of outboxDir.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try {
      items.push(JSON.parse(entry.textSync()) as OutboxItem);
    } catch {
      // Skip a file that was only partly written (e.g. the app was killed mid-write).
    }
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function save(item: OutboxItem) {
  if (!outboxDir.exists) outboxDir.create({ intermediates: true, idempotent: true });
  const file = new File(outboxDir, `${item.id}.json`);
  if (!file.exists) file.create();
  file.write(JSON.stringify(item));
}

function remove(id: string) {
  const file = new File(outboxDir, `${id}.json`);
  if (file.exists) file.delete();
}

const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Could not send the note.');

type OutboxState = {
  items: OutboxItem[];
  /** Saves the note on the phone, then sends it after any older unsent notes. */
  send: (input: SubmitNoteInput) => Promise<SendOutcome>;
  /** Tries all waiting notes now, including ones that failed before. */
  retryAll: () => Promise<void>;
  /** Removes a note from the outbox and returns it, to put back in the editor. */
  takeBack: (id: string) => OutboxItem | undefined;
};

const OutboxContext = createContext<OutboxState | null>(null);

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<OutboxItem[]>(() => readAll());
  const running = useRef<Promise<Map<string, SendOutcome>> | null>(null);

  /** Sends waiting notes oldest first; stops at the first one that should be retried later, to keep order. */
  const processQueue = useCallback(async () => {
    while (running.current) await running.current.catch(() => undefined);
    const run = (async () => {
      const outcomes = new Map<string, SendOutcome>();
      for (const item of readAll()) {
        if (item.failed) continue;
        try {
          const result = await submitNote(item.input);
          remove(item.id);
          outcomes.set(item.id, { status: 'sent', result });
          void queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(item.input.documentId) });
        } catch (e) {
          const error = errorMessage(e);
          if (isRetryableError(e)) {
            save({ ...item, error });
            outcomes.set(item.id, { status: 'queued', error });
            break;
          }
          save({ ...item, error, failed: true });
          outcomes.set(item.id, { status: 'failed', error });
        }
      }
      setItems(readAll());
      return outcomes;
    })();
    running.current = run;
    try {
      return await run;
    } finally {
      if (running.current === run) running.current = null;
    }
  }, [queryClient]);

  const send = useCallback(
    async (input: SubmitNoteInput): Promise<SendOutcome> => {
      const item: OutboxItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        input,
      };
      save(item);
      setItems(readAll());
      const outcome = (await processQueue()).get(item.id) ?? { status: 'queued' as const };
      if (outcome.status === 'failed') {
        // A brand-new note that can't be sent goes back to the editor instead of waiting in the outbox.
        remove(item.id);
        setItems(readAll());
      }
      return outcome;
    },
    [processQueue],
  );

  const retryAll = useCallback(async () => {
    for (const item of readAll()) if (item.failed) save({ ...item, failed: false });
    await processQueue();
  }, [processQueue]);

  const takeBack = useCallback((id: string) => {
    const item = readAll().find((i) => i.id === id);
    if (item) remove(id);
    setItems(readAll());
    return item;
  }, []);

  useEffect(() => {
    void processQueue();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void processQueue();
    });
    return () => sub.remove();
  }, [processQueue]);

  const waiting = items.filter((i) => !i.failed).length;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void processQueue(), 30_000);
    return () => clearInterval(timer);
  }, [waiting, processQueue]);

  const value = useMemo(() => ({ items, send, retryAll, takeBack }), [items, send, retryAll, takeBack]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error('useOutbox must be used inside OutboxProvider');
  return ctx;
}
