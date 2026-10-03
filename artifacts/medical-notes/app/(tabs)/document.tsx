import { getGetDocumentQueryKey, getListDriveDocumentsQueryKey, useCreateDocument, useGetDocument, useListDriveDocuments } from '@/lib/google/hooks';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useDocument } from '@/context/DocumentContext';
import { useColors } from '@/hooks/useColors';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/google/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getDocumentId(value: string) {
  const match = value.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || value.trim();
}

export default function DocumentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { documentId, setDocumentId, clearDocument, hydrated } = useDocument();
  const [value, setValue] = useState(documentId);
  const [title, setTitle] = useState('Medical Notes');
  const [message, setMessage] = useState('');
  const documentQuery = useGetDocument(documentId, {
    query: {
      enabled: hydrated && Boolean(documentId),
      queryKey: getGetDocumentQueryKey(documentId),
    },
  });
  const driveDocuments = useListDriveDocuments({
    query: { queryKey: getListDriveDocumentsQueryKey() },
  });
  const createDocument = useCreateDocument();
  const { email, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in with Google again, and the connected document will be forgotten.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  useEffect(() => {
    if (documentId) setValue(documentId);
  }, [documentId]);

  const connect = () => {
    const id = getDocumentId(value);
    if (!id) return;
    void setDocumentId(id);
    setMessage('Document connected.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const create = () => {
    if (!title.trim()) return;
    setMessage('');
    createDocument.mutate(
      { data: { title: title.trim() } },
      {
        onSuccess: async (data) => {
          await setDocumentId(data.documentId);
          setValue(data.documentId);
          setMessage('New Google Doc created and connected.');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 110, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Text style={[styles.eyebrow, { color: colors.primary }]}>DESTINATION</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Your Google Doc.</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Every specialty gets its own tab. Paste a document link or create a fresh one.</Text>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}><Feather name="link-2" size={20} color={colors.primary} /></View>
            <View style={styles.flex}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Connect existing doc</Text><Text style={[styles.panelText, { color: colors.mutedForeground }]}>Use the full Google Docs link or ID.</Text></View>
          </View>
          <TextInput
            testID="document-input"
            value={value}
            onChangeText={setValue}
            placeholder="docs.google.com/document/d/..."
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.foreground, borderColor: colors.input }]}
          />
          <Pressable testID="connect-button" onPress={connect} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Connect document</Text>
          </Pressable>
        </View>

        <View style={styles.orRow}><View style={[styles.line, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>or</Text><View style={[styles.line, { backgroundColor: colors.border }]} /></View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#E8E2F8' }]}><Feather name="folder" size={20} color="#6951A6" /></View>
            <View style={styles.flex}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Choose from Google Drive</Text><Text style={[styles.panelText, { color: colors.mutedForeground }]}>Select one of your Google Docs.</Text></View>
          </View>
          {driveDocuments.isLoading ? <ActivityIndicator color={colors.primary} /> : driveDocuments.isError ? <Text style={[styles.panelText, { color: colors.destructive }]}>{driveDocuments.error?.message || 'Could not load Google Drive.'}</Text> : driveDocuments.data?.files.length ? (
            <View style={styles.driveList}>{driveDocuments.data.files.map((file) => (
              <Pressable key={file.id} testID={`drive-document-${file.id}`} onPress={() => { void setDocumentId(file.id); setValue(file.id); setMessage(`${file.name} connected.`); }} style={({ pressed }) => [styles.driveRow, { backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 }]}>
                <Feather name="file-text" size={17} color={colors.primary} />
                <Text style={[styles.driveName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
                <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
              </Pressable>
            ))}</View>
          ) : <Text style={[styles.panelText, { color: colors.mutedForeground }]}>No Google Docs found.</Text>}
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#FFF0D9' }]}><Feather name="file-plus" size={20} color="#B87516" /></View>
            <View style={styles.flex}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Create a fresh doc</Text><Text style={[styles.panelText, { color: colors.mutedForeground }]}>A blank document, ready for your tabs.</Text></View>
          </View>
          <TextInput testID="title-input" value={title} onChangeText={setTitle} placeholder="Document title" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input }]} />
          <Pressable testID="create-button" onPress={create} disabled={createDocument.isPending} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.secondary, opacity: createDocument.isPending ? 0.6 : pressed ? 0.8 : 1 }]}>
            {createDocument.isPending ? <ActivityIndicator color={colors.primary} /> : <Feather name="plus" size={18} color={colors.primary} />}
            <Text style={[styles.secondaryText, { color: colors.secondaryForeground }]}>Create document</Text>
          </Pressable>
          {createDocument.isError ? <Text style={[styles.panelText, { color: colors.destructive }]}>{createDocument.error.message}</Text> : null}
        </View>

        {documentId ? (
          <View style={[styles.current, { backgroundColor: colors.secondary }]}>
            <View style={styles.currentTop}><Feather name="check-circle" size={18} color={colors.primary} /><Text style={[styles.currentTitle, { color: colors.secondaryForeground }]}>Connected</Text></View>
            {documentQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : documentQuery.isError ? <Text style={[styles.panelText, { color: colors.destructive }]}>{documentQuery.error?.message || "We couldn't read the document."}</Text> : (
              <>
                <Text style={[styles.docTitle, { color: colors.foreground }]}>{documentQuery.data?.title || 'Google Doc'}</Text>
                <View style={styles.tabsRow}>{(documentQuery.data?.tabs || []).map((tab) => <View key={tab.tabId} style={[styles.tabChip, { backgroundColor: colors.card }]}><Text style={[styles.tabText, { color: colors.secondaryForeground }]}>{tab.title}</Text></View>)}</View>
                <Pressable onPress={() => documentQuery.data?.url && Linking.openURL(documentQuery.data.url)}><Text style={[styles.openLink, { color: colors.primary }]}>Open in Google Docs <Feather name="external-link" size={13} /></Text></Pressable>
              </>
            )}
            <Pressable testID="disconnect-button" onPress={() => { void clearDocument(); setMessage('Document disconnected.'); }}><Text style={[styles.disconnect, { color: colors.destructive }]}>Disconnect</Text></Pressable>
          </View>
        ) : null}
        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}

        <View style={[styles.account, { borderColor: colors.border }]}>
          <Feather name="user" size={16} color={colors.mutedForeground} />
          <Text style={[styles.accountEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{email}</Text>
          <Pressable testID="sign-out-button" onPress={confirmSignOut} hitSlop={10}>
            <Text style={[styles.disconnect, { color: colors.destructive, marginTop: 0 }]}>Sign out</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, marginTop: 5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
  panelHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 },
  iconCircle: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  panelTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  panelText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 3 },
  input: { borderWidth: 1, borderRadius: 13, minHeight: 48, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 12 },
  primaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  line: { height: 1, flex: 1 },
  or: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  secondaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  current: { borderRadius: 18, padding: 16, marginTop: 3, gap: 11 },
  currentTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  docTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tabChip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  tabText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  openLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  disconnect: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 3 },
  message: { fontFamily: 'Inter_600SemiBold', textAlign: 'center', fontSize: 13, marginTop: 14 },
  driveList: { gap: 7 },
  driveRow: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  driveName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, marginTop: 24, paddingTop: 16 },
  accountEmail: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
});