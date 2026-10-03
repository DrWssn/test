// Drop-in replacements for the old @workspace/api-client-react hooks, same names and call shapes.
import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  createDocument,
  getDocument,
  listDriveDocuments,
  submitNote,
  type DocumentInfo,
  type DriveFile,
  type SubmitNoteInput,
} from './api';

export const getGetDocumentQueryKey = (documentId: string) => ['google', 'document', documentId] as const;
export const getListDriveDocumentsQueryKey = () => ['google', 'drive-documents'] as const;

type QueryOpts<T> = { query?: Partial<UseQueryOptions<T, Error, T, readonly unknown[]>> };

export function useGetDocument(documentId: string, options?: QueryOpts<DocumentInfo>) {
  return useQuery({
    queryKey: getGetDocumentQueryKey(documentId),
    queryFn: () => getDocument(documentId),
    ...options?.query,
  });
}

export function useListDriveDocuments(options?: QueryOpts<{ files: DriveFile[] }>) {
  return useQuery({
    queryKey: getListDriveDocumentsQueryKey(),
    queryFn: listDriveDocuments,
    ...options?.query,
  });
}

export function useCreateDocument() {
  return useMutation({ mutationFn: ({ data }: { data: { title: string } }) => createDocument(data.title) });
}

export function useSubmitNote() {
  return useMutation({ mutationFn: ({ data }: { data: SubmitNoteInput }) => submitNote(data) });
}
