import { useSubmitNote } from '@/lib/google/hooks';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useDocument } from '@/context/DocumentContext';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { documentId } = useDocument();
  const [text, setText] = useState('');
  const [image, setImage] = useState<{
    base64?: string;
    uri: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    fileName: string;
  } | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [showImageUrl, setShowImageUrl] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const submitNote = useSubmitNote();
  const tags = useMemo(
    () => [...new Set(text.match(/#[a-zA-Z][a-zA-Z0-9_-]*/g) || [])],
    [text],
  );

  const sendNote = async () => {
    if (!documentId) {
      router.push('/document');
      return;
    }
    if (!text.trim() || tags.length === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavedMessage('');
    submitNote.mutate(
      {
        data: {
          documentId,
          text: text.trim(),
          ...(image?.base64
            ? { imageBase64: image.base64, imageMimeType: image.mimeType, imageName: image.fileName }
            : {}),
          ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          setText('');
          setImage(null);
          setImageUrl('');
          setShowImageUrl(false);
          setSavedMessage(data.message);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => {
          setSavedMessage('');
        },
      },
    );
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

  const canSend = Boolean(documentId && text.trim() && tags.length > 0 && !submitNote.isPending);

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
            placeholder={'Example: #cardiology\nFollow-up: patient reports improved exercise tolerance...'}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
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
        {submitNote.isError && (
          <View style={[styles.error, { backgroundColor: '#FBE8E8' }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.destructive }]}>{submitNote.error?.message || 'Could not save this note. Check the document connection.'}</Text>
          </View>
        )}
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
          {submitNote.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="send" size={18} color={colors.primaryForeground} />}
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
  sectionHeader: { marginTop: 8 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 },
  editorCard: { borderRadius: 20, borderWidth: 1, minHeight: 245, padding: 16 },
  input: { flex: 1, minHeight: 190, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 25 },
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