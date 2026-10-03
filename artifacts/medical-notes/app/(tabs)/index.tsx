import { canonicalTabName, normalizedTag, tagForTab, tagPattern } from '@/lib/google/api';
import { useGetDocument } from '@/lib/google/hooks';
import { useOutbox, type OutboxItem } from '@/lib/outbox';
import { DRAFT_KEY } from '@/lib/storageKeys';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useDocument } from '@/context/DocumentContext';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PickedImage = {
  base64?: string;
  uri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
};

/** Edit distance, to suggest the intended tab for a mistyped tag. */
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
}

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { documentId } = useDocument();
  const outbox = useOutbox();
  const [text, setText] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [showImageUrl, setShowImageUrl] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const documentQuery = useGetDocument(documentId, { query: { enabled: Boolean(documentId) } });
  const tags = useMemo(() => [...new Set(text.match(tagPattern) || [])], [text]);

  // Keep the note text across app restarts until it is sent.
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((draft) => {
        if (draft) setText((current) => current || draft);
      })
      .catch(() => undefined)
      .finally(() => setDraftLoaded(true));
  }, []);
  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      (text ? AsyncStorage.setItem(DRAFT_KEY, text) : AsyncStorage.removeItem(DRAFT_KEY)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [text, draftLoaded]);

  // Existing tabs that can be written as a tag, for suggestions and typo checks.
  const tabTags = useMemo(
    () =>
      (documentQuery.data?.tabs || []).flatMap((tab) => {
        const tag = tagForTab(tab.title);
        return tag ? [{ title: tab.title, tag }] : [];
      }),
    [documentQuery.data],
  );

  // The "#partial" tag being typed right before the cursor, if any.
  const typing = useMemo(() => {
    const match = text.slice(0, cursor).match(/(^|\s)#([a-zA-Z0-9_-]*)$/);
    return match ? { partial: match[2], start: cursor - match[2].length - 1 } : null;
  }, [text, cursor]);

  const suggestions = useMemo(() => {
    if (!typing) return [];
    const partial = canonicalTabName(typing.partial);
    return tabTags
      .filter((t) => canonicalTabName(t.title).startsWith(partial) && t.tag.slice(1) !== typing.partial)
      .slice(0, 6);
  }, [typing, tabTags]);

  // The destination tag doesn't match any tab: saving would create a new one, often from a typo.
  const newTab = useMemo(() => {
    if (!tags[0] || !documentQuery.data) return null;
    const wanted = canonicalTabName(normalizedTag(tags[0]));
    if (documentQuery.data.tabs.some((t) => canonicalTabName(t.title) === wanted)) return null;
    const closest = tabTags
      .map((t) => ({ ...t, distance: editDistance(wanted, canonicalTabName(t.title)) }))
      .filter((t) => t.distance <= 2)
      .sort((a, b) => a.distance - b.distance)[0];
    return { tag: tags[0], title: normalizedTag(tags[0]), closest };
  }, [tags, documentQuery.data, tabTags]);

  const insertTag = (tag: string) => {
    if (!typing) return;
    const rest = text.slice(cursor).replace(/^[a-zA-Z0-9_-]*/, '');
    const next = `${text.slice(0, typing.start)}${tag}${rest.startsWith(' ') ? '' : ' '}${rest}`;
    setText(next);
    setCursor(typing.start + tag.length + 1);
  };

  const replaceTag = (from: string, to: string) => setText((current) => current.replace(from, to));

  const clearEditor = () => {
    setText('');
    setImage(null);
    setImageUrl('');
    setShowImageUrl(false);
  };

  const sendNote = async () => {
    if (!documentId) {
      router.push('/document');
      return;
    }
    if (!text.trim() || tags.length === 0 || sending) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavedMessage('');
    setSendError('');
    setSending(true);
    try {
      const outcome = await outbox.send({
        documentId,
        text: text.trim(),
        ...(image?.base64 ? { imageBase64: image.base64, imageMimeType: image.mimeType, imageName: image.fileName } : {}),
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      });
      if (outcome.status === 'failed') {
        setSendError(outcome.error);
        return;
      }
      clearEditor();
      if (outcome.status === 'sent') {
        setSavedMessage(outcome.result.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setSavedMessage('Saved on this phone. It will be sent to Google Docs automatically when you are back online.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (e) {
      // Only reached if the phone itself can't store the note.
      setSendError(e instanceof Error ? e.message : 'Could not save this note.');
    } finally {
      setSending(false);
    }
  };

  const editFailed = (item: OutboxItem) => {
    if (text.trim() || image) {
      Alert.alert('Replace current note?', 'The note in the editor will be replaced by the unsent one.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => loadIntoEditor(item.id) },
      ]);
      return;
    }
    loadIntoEditor(item.id);
  };

  const loadIntoEditor = (id: string) => {
    const item = outbox.takeBack(id);
    if (!item) return;
    const { input } = item;
    setText(input.text);
    setImage(
      input.imageBase64
        ? {
            base64: input.imageBase64,
            uri: `data:${input.imageMimeType || 'image/jpeg'};base64,${input.imageBase64}`,
            mimeType: (input.imageMimeType as PickedImage['mimeType']) || 'image/jpeg',
            fileName: input.imageName || 'medical-note-image.jpg',
          }
        : null,
    );
    setImageUrl(input.imageUrl || '');
    setShowImageUrl(Boolean(input.imageUrl));
    setSendError(item.error || '');
    setSavedMessage('');
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.85,
    });
    const asset = result.canceled ? undefined : result.assets?.[0];
    if (asset) {
      if (!asset.base64) {
        Alert.alert('Image could not be read', 'Please choose the image again.');
        return;
      }
      const mimeType = asset.mimeType || 'image/jpeg';
      if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
        Alert.alert('Image format not supported', 'Choose a JPG, PNG, or WebP image.');
        return;
      }
      setImage({
        base64: asset.base64,
        uri: asset.uri,
        mimeType,
        fileName: (asset.fileName || 'medical-note-image.jpg').slice(0, 160),
      });
      setImageUrl('');
      setShowImageUrl(false);
    }
  };

  const pasteImage = async () => {
    const pasted = await Clipboard.getImageAsync({ format: 'png' });
    if (pasted?.data) {
      if (pasted.data.length > 10_000_000) {
        Alert.alert('Image is too large', 'Choose or copy an image smaller than 7.5 MB.');
        return;
      }
      setImage({
        base64: pasted.data,
        uri: `data:image/png;base64,${pasted.data}`,
        mimeType: 'image/png',
        fileName: 'clipboard-image.png',
      });
      setImageUrl('');
      setShowImageUrl(false);
    }
  };

  const canSend = Boolean(documentId && text.trim() && tags.length > 0 && !sending);
  const waiting = outbox.items.filter((i) => !i.failed);
  const failed = outbox.items.filter((i) => i.failed);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 110 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.topline}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MEDICAL NOTES</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Capture clearly.</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: documentId ? colors.primary : colors.border }]}>
            <Feather name={documentId ? 'check' : 'link'} size={15} color={colors.primaryForeground} />
          </View>
        </View>

        {!documentId ? (
          <Pressable
            testID="connect-document"
            onPress={() => router.push('/document')}
            style={({ pressed }) => [styles.setupCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
              <Feather name="file-text" size={22} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Connect a Google Doc</Text>
              <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Choose where your notes should be filed.</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <View style={[styles.connectedPill, { backgroundColor: colors.secondary }]}>
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={[styles.connectedText, { color: colors.secondaryForeground }]}>Google Doc connected</Text>
            <Pressable testID="edit-document" onPress={() => router.push('/document')} hitSlop={12}>
              <Text style={[styles.editText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          </View>
        )}

        {waiting.length > 0 && (
          <View testID="outbox-waiting" style={[styles.outboxCard, { backgroundColor: colors.accent }]}>
            <View style={styles.outboxHeader}>
              <Feather name="upload-cloud" size={17} color={colors.accentForeground} />
              <Text style={[styles.noticeText, { color: colors.accentForeground }]}>
                {waiting.length === 1 ? '1 note' : `${waiting.length} notes`} waiting to send
              </Text>
              <Pressable testID="outbox-retry" onPress={() => void outbox.retryAll()} hitSlop={10}>
                <Text style={[styles.editText, { color: colors.primary }]}>Send now</Text>
              </Pressable>
            </View>
            {waiting[0].error ? (
              <Text style={[styles.outboxError, { color: colors.accentForeground }]} numberOfLines={2}>{waiting[0].error}</Text>
            ) : null}
          </View>
        )}
        {failed.map((item) => (
          <View key={item.id} style={[styles.outboxCard, { backgroundColor: '#FBE8E8' }]}>
            <View style={styles.outboxHeader}>
              <Feather name="alert-circle" size={17} color={colors.destructive} />
              <Text style={[styles.noticeText, { color: colors.destructive }]} numberOfLines={1}>
                Not sent: {item.input.text.replace(/\s+/g, ' ').slice(0, 60)}
              </Text>
              <Pressable onPress={() => editFailed(item)} hitSlop={10}>
                <Text style={[styles.editText, { color: colors.destructive }]}>Edit</Text>
              </Pressable>
            </View>
            {item.error ? (
              <Text style={[styles.outboxError, { color: colors.destructive }]} numberOfLines={3}>{item.error}</Text>
            ) : null}
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What happened?</Text>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>Add a specialty tag to file it</Text>
        </View>
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.input }]}>
          <TextInput
            testID="note-input"
            multiline
            value={text}
            onChangeText={setText}
            onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
            placeholder={'Example: #cardiology\nFollow-up: patient reports improved exercise tolerance...'}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
          {suggestions.length > 0 && (
            <View testID="tag-suggestions" style={styles.suggestionRow}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.tag}
                  onPress={() => insertTag(s.tag)}
                  style={({ pressed }) => [styles.tag, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.tagText, { color: colors.secondaryForeground }]}>{s.tag}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.editorFooter}>
            <View style={styles.tagRow}>
              {tags.length > 0 ? tags.map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.tagText, { color: colors.accentForeground }]}>{tag}</Text>
                </View>
              )) : <Text style={[styles.hint, { color: colors.mutedForeground }]}>Use #specialty</Text>}
            </View>
            <Text style={[styles.counter, { color: colors.mutedForeground }]}>{text.length}</Text>
          </View>
        </View>

        {newTab && (
          <View testID="new-tab-notice" style={[styles.notice, { backgroundColor: colors.accent }]}>
            <Feather name="plus-square" size={16} color={colors.accentForeground} />
            <Text style={[styles.noticeText, { color: colors.accentForeground }]}>
              No tab matches {newTab.tag}. Saving will create a new “{newTab.title}” tab.
              {newTab.closest ? ` Did you mean ${newTab.closest.tag}?` : ''}
            </Text>
            {newTab.closest ? (
              <Pressable testID="use-closest-tag" onPress={() => replaceTag(newTab.tag, newTab.closest!.tag)} hitSlop={10}>
                <Text style={[styles.editText, { color: colors.primary }]}>Use it</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={styles.imageTools}>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>Add an image</Text>
          <View style={styles.imageButtons}>
            <Pressable testID="attach-image" onPress={pickImage} style={[styles.imageButton, { backgroundColor: colors.secondary }]}>
              <Feather name="paperclip" size={15} color={colors.primary} />
              <Text style={[styles.imageButtonText, { color: colors.secondaryForeground }]}>Attach</Text>
            </Pressable>
            <Pressable testID="paste-image" onPress={pasteImage} style={[styles.imageButton, { backgroundColor: colors.secondary }]}>
              <Feather name="clipboard" size={15} color={colors.primary} />
              <Text style={[styles.imageButtonText, { color: colors.secondaryForeground }]}>Paste</Text>
            </Pressable>
            <Pressable testID="image-link" onPress={() => setShowImageUrl((current) => !current)} style={[styles.imageButton, { backgroundColor: colors.secondary }]}>
              <Feather name="link" size={15} color={colors.primary} />
              <Text style={[styles.imageButtonText, { color: colors.secondaryForeground }]}>Link</Text>
            </Pressable>
          </View>
        </View>
        {showImageUrl ? (
          <View style={styles.urlGroup}>
            <TextInput
              testID="image-url-input"
              value={imageUrl}
              onChangeText={(value) => { setImageUrl(value); if (value) setImage(null); }}
              placeholder="https://example.com/image.jpg"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.urlInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
            />
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>The image link will be included when the note is saved.</Text>
          </View>
        ) : null}
        {image ? (
          <View style={[styles.imagePreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image source={{ uri: image.uri }} style={styles.previewImage} />
            <View style={styles.flex}>
              <Text style={[styles.imageName, { color: colors.foreground }]} numberOfLines={1}>{image.fileName}</Text>
              <Text style={[styles.helper, { color: colors.mutedForeground }]}>Attached privately when the note is saved</Text>
            </View>
            <Pressable testID="remove-image" onPress={() => setImage(null)} hitSlop={10}><Feather name="x-circle" size={21} color={colors.mutedForeground} /></Pressable>
          </View>
        ) : null}

        {tags.length > 1 && (
          <View style={[styles.notice, { backgroundColor: colors.accent }]}>
            <Feather name="info" size={16} color={colors.accentForeground} />
            <Text style={[styles.noticeText, { color: colors.accentForeground }]}>The first tag decides the destination tab.</Text>
          </View>
        )}
        {sendError ? (
          <View style={[styles.error, { backgroundColor: '#FBE8E8' }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.destructive }]}>{sendError}</Text>
          </View>
        ) : null}
        {savedMessage ? (
          <View style={[styles.success, { backgroundColor: colors.secondary }]}>
            <Feather name="check-circle" size={17} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.secondaryForeground }]}>{savedMessage}</Text>
          </View>
        ) : null}

        <Pressable
          testID="send-note"
          onPress={sendNote}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: colors.primary, opacity: !canSend ? 0.45 : pressed ? 0.78 : 1 },
          ]}
        >
          {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="send" size={18} color={colors.primaryForeground} />}
          <Text style={[styles.sendText, { color: colors.primaryForeground }]}>{documentId ? 'Save to Google Doc' : 'Connect a document first'}</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 18 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, letterSpacing: 2, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 32, lineHeight: 38, fontFamily: 'Inter_700Bold', marginTop: 5 },
  statusDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  setupCard: { borderRadius: 20, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  cardText: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 3 },
  connectedPill: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectedText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  editText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  outboxCard: { borderRadius: 14, padding: 12, gap: 6 },
  outboxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outboxError: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginLeft: 25 },
  sectionHeader: { marginTop: 8 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 },
  editorCard: { borderRadius: 20, borderWidth: 1, minHeight: 245, padding: 16 },
  input: { flex: 1, minHeight: 190, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 25 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  editorFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  tagRow: { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  counter: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  notice: { padding: 12, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { padding: 12, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  success: { padding: 12, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  noticeText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, flex: 1 },
  sendButton: { minHeight: 56, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 2 },
  sendText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  imageTools: { gap: 8 },
  imageButtons: { flexDirection: 'row', gap: 8 },
  imageButton: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  imageButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  urlInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 14 },
  imagePreview: { borderWidth: 1, borderRadius: 15, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewImage: { width: 54, height: 54, borderRadius: 10 },
  imageName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  urlGroup: { gap: 2 },
});
