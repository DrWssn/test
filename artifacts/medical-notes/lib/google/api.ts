// Direct Google Drive / Docs calls from the phone, replacing the old api-server.
import { discardAccessToken, getAccessToken } from './auth';

export type TabInfo = { tabId: string; title: string };
export type DocumentInfo = { documentId: string; title: string; url: string; tabs: TabInfo[] };
export type DriveFile = { id: string; name: string; modifiedTime: string; webViewLink: string };
export type SubmitNoteInput = {
  documentId: string;
  text: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageName?: string;
  imageUrl?: string;
};
export type SubmitNoteResult = {
  documentId: string;
  tabId: string;
  tabTitle: string;
  createdTab: boolean;
  tags: string[];
  message: string;
};

type GoogleTab = { tabId: string; title: string; bodyContent: Array<{ startIndex?: number; endIndex?: number }> };

export class GoogleApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function google(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
  const token = await getAccessToken();
  const res = await send(token);
  if (res.status !== 401) return res;
  // Cached token expired or was revoked: drop it and retry once with a fresh one.
  await discardAccessToken(token);
  return send(await getAccessToken());
}

async function googleJson<T>(url: string, init: RequestInit, failMessage: string): Promise<T> {
  const res = await google(url, init);
  if (!res.ok) {
    // Google's own reason (e.g. "Google Docs API has not been used in project ...") makes setup problems fixable.
    const detail = await res
      .json()
      .then((body: any) => body?.error?.message as string | undefined)
      .catch(() => undefined);
    throw new GoogleApiError(detail ? `${failMessage} (${res.status}: ${detail})` : `${failMessage} (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

const DOCS = 'https://docs.googleapis.com/v1/documents';

export function documentUrl(documentId: string) {
  return `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`;
}

function walkTabs(tabs: any[] | undefined): GoogleTab[] {
  if (!Array.isArray(tabs)) return [];
  return tabs.flatMap((tab) => {
    const p = tab?.tabProperties;
    const current = p?.tabId
      ? [{
          tabId: String(p.tabId),
          title: String(p.title || 'Untitled'),
          bodyContent: Array.isArray(tab?.documentTab?.body?.content) ? tab.documentTab.body.content : [],
        }]
      : [];
    return [...current, ...walkTabs(tab?.childTabs)];
  });
}

function extractTabs(document: any): GoogleTab[] {
  const tabs = walkTabs(document?.tabs);
  if (tabs.length > 0) return tabs;
  const fallback = document?.body?.content;
  return [{ tabId: '', title: 'Document', bodyContent: Array.isArray(fallback) ? fallback : [] }];
}

function toDocumentInfo(document: any): DocumentInfo {
  const id = String(document.documentId);
  return {
    documentId: id,
    title: String(document.title || 'Untitled document'),
    url: documentUrl(id),
    tabs: extractTabs(document).map((t) => ({ tabId: t.tabId, title: t.title })),
  };
}

async function fetchRawDocument(documentId: string) {
  return googleJson<any>(
    `${DOCS}/${encodeURIComponent(documentId)}?includeTabsContent=true`,
    { method: 'GET' },
    'We could not open that Google Doc.',
  );
}

/** With requiredRevisionId, Google rejects the update (400) if the document changed since that revision was read. */
async function batchUpdate(documentId: string, requests: unknown[], failMessage: string, requiredRevisionId?: string) {
  const body = requiredRevisionId ? { requests, writeControl: { requiredRevisionId } } : { requests };
  return googleJson<any>(
    `${DOCS}/${encodeURIComponent(documentId)}:batchUpdate`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    failMessage,
  );
}

function isRevisionConflict(e: unknown) {
  return e instanceof GoogleApiError && e.status === 400 && /revision/i.test(e.message);
}

export async function getDocument(documentId: string): Promise<DocumentInfo> {
  return toDocumentInfo(await fetchRawDocument(documentId));
}

export async function createDocument(title: string): Promise<DocumentInfo> {
  const doc = await googleJson<any>(
    DOCS,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) },
    'Google Docs could not create the document.',
  );
  return toDocumentInfo(doc);
}

export async function listDriveDocuments(): Promise<{ files: DriveFile[] }> {
  const params = new URLSearchParams({
    q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
    fields: 'files(id,name,modifiedTime,webViewLink)',
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  });
  const data = await googleJson<{ files?: any[] }>(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { method: 'GET' },
    'Google Drive could not list your documents.',
  );
  return {
    files: (data.files || []).map((f) => ({
      id: String(f.id),
      name: String(f.name || 'Untitled document'),
      modifiedTime: String(f.modifiedTime || ''),
      webViewLink: String(f.webViewLink || documentUrl(String(f.id))),
    })),
  };
}

/** Uploads an image privately to the user's Drive (not shared) and returns its view link. */
async function uploadImageToDrive(base64: string, mimeType: string, fileName: string): Promise<string> {
  const boundary = `medical-notes-${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, mimeType }) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    base64 +
    `\r\n--${boundary}--\r\n`;
  const uploaded = await googleJson<{ id?: string; webViewLink?: string }>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    'The image could not be uploaded to Google Drive.',
  );
  if (!uploaded.id) throw new GoogleApiError('Drive image upload returned no file ID');
  return uploaded.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view`;
}

export const tagPattern = /#[a-zA-Z][a-zA-Z0-9_-]*/g;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** "#follow-up" -> "follow up": the title a new tab gets for this tag. */
export function normalizedTag(tag: string) {
  return tag.slice(1).replace(/[-_]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Case, spaces, hyphens and underscores don't matter when matching a tag to a tab ("#Follow_Up" = "Follow-up"). */
export function canonicalTabName(name: string) {
  return name.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

/** The tag that files a note into this tab, or null if the title can't be written as a tag (e.g. "Ob/Gyn"). */
export function tagForTab(title: string): string | null {
  const tag = `#${title.trim().replace(/\s+/g, '-')}`;
  return /^#[a-zA-Z][a-zA-Z0-9_-]*$/.test(tag) ? tag : null;
}

/**
 * True if retrying later could succeed: no network, Google busy or down, or the sign-in needs renewing.
 * False for problems that won't fix themselves, like a deleted document or one you can't edit.
 */
export function isRetryableError(e: unknown) {
  if (!(e instanceof GoogleApiError)) return true;
  if (e.status === undefined) return false;
  return e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500;
}

export async function submitNote(input: SubmitNoteInput): Promise<SubmitNoteResult> {
  const text = input.text?.trim();
  if (!input.documentId || !text) throw new GoogleApiError('Write a note before sending it.');
  const tags = [...new Set(text.match(tagPattern) || [])];
  if (tags.length === 0) throw new GoogleApiError('Add a specialty tag such as #cardiology.');

  const tagTitle = normalizedTag(tags[0]);
  const noteText = text.replace(tags[0], '').trim();
  const { documentId } = input;

  // Validate attachments before changing the document.
  if (input.imageBase64) {
    const mimeType = input.imageMimeType || 'image/jpeg';
    if (!allowedImageTypes.has(mimeType)) throw new GoogleApiError('Only JPG, PNG, and WebP images are supported.');
    if (Math.floor((input.imageBase64.length * 3) / 4) > 7_500_000) {
      throw new GoogleApiError('That image is too large. Choose an image under 7.5 MB.');
    }
  }
  let publicImageUrl: string | undefined;
  if (input.imageUrl) {
    let url: URL;
    try {
      url = new URL(input.imageUrl);
    } catch {
      throw new GoogleApiError('That image link is not valid.');
    }
    if (url.protocol !== 'https:' || url.toString().length > 2048) throw new GoogleApiError('Use a direct HTTPS image link.');
    publicImageUrl = url.toString();
  }

  let createdTab = false;
  let privateImageLink: string | undefined;
  let saved: { target: GoogleTab; loc: (index: number) => Record<string, unknown>; endIndex: number; revisionId?: string } | undefined;

  // Insert positions come from a fresh read, and each write is pinned to that read's revision. If the doc
  // changed in between (edited elsewhere, another phone), Google rejects the write and we re-read and retry.
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    const document = await fetchRawDocument(documentId);
    const tabs = extractTabs(document);
    const target = tabs.find((t) => canonicalTabName(t.title) === canonicalTabName(tagTitle));

    if (!target) {
      if (createdTab) throw new GoogleApiError(`The ${tagTitle} tab was created, but the note could not be routed.`);
      const addResult = await batchUpdate(
        documentId,
        [{ addDocumentTab: { tabProperties: { title: tagTitle } } }],
        `We could not create the ${tagTitle} tab. Check that this document is editable.`,
      );
      if (!addResult?.replies?.[0]?.addDocumentTab?.tabProperties?.tabId) {
        throw new GoogleApiError(`The ${tagTitle} tab was created, but the note could not be routed.`);
      }
      createdTab = true;
      attempt--; // Creating the tab is not a failed attempt; re-read to get the new tab's contents.
      continue;
    }

    // Upload once, only after the destination tab is known to exist.
    if (input.imageBase64 && !privateImageLink) {
      privateImageLink = await uploadImageToDrive(
        input.imageBase64,
        input.imageMimeType || 'image/jpeg',
        input.imageName || `medical-note-${Date.now()}.jpg`,
      );
    }

    const loc = (index: number) => (target.tabId ? { tabId: target.tabId, index } : { index });
    const last = target.bodyContent.at(-1);
    const insertionIndex = Math.max(1, Number(last?.endIndex || 2) - 1);
    const addPageBreak = insertionIndex > 1;
    // Docs inserts a page break followed by a newline, so the following text starts two indexes later.
    const textInsertionIndex = insertionIndex + (addPageBreak ? 2 : 0);
    const prefix = addPageBreak || insertionIndex === 1 ? '' : '\n';
    const attachmentLabel = privateImageLink ? 'Image attachment' : '';
    const entry = `${prefix}${noteText}${attachmentLabel ? `\n${attachmentLabel}` : ''}\n`;

    const requests: Record<string, unknown>[] = [];
    if (addPageBreak) requests.push({ insertPageBreak: { location: loc(insertionIndex) } });
    requests.push({ insertText: { location: loc(textInsertionIndex), text: entry } });
    if (privateImageLink) {
      requests.push({
        updateTextStyle: {
          range: {
            ...(target.tabId ? { tabId: target.tabId } : {}),
            startIndex: textInsertionIndex + entry.length - attachmentLabel.length - 1,
            endIndex: textInsertionIndex + entry.length - 1,
          },
          textStyle: { link: { url: privateImageLink } },
          fields: 'link',
        },
      });
    }

    try {
      const result = await batchUpdate(
        documentId,
        requests,
        'The note could not be added. Check that this document is editable.',
        document.revisionId,
      );
      saved = { target, loc, endIndex: textInsertionIndex + entry.length, revisionId: result?.writeControl?.requiredRevisionId };
    } catch (e) {
      if (!isRevisionConflict(e)) throw e;
    }
  }
  if (!saved) throw new GoogleApiError('The document kept changing while saving. Please try again.');
  const { target, loc } = saved;

  let imageLinkMessage = '';
  if (publicImageUrl) {
    try {
      await batchUpdate(
        documentId,
        [{
          insertInlineImage: {
            location: loc(saved.endIndex),
            uri: publicImageUrl,
            objectSize: { height: { magnitude: 240, unit: 'PT' }, width: { magnitude: 360, unit: 'PT' } },
          },
        }],
        'image',
        saved.revisionId,
      );
    } catch {
      imageLinkMessage = ' The note was saved, but Docs could not embed that link; try attaching the image file instead.';
    }
  }

  return {
    documentId,
    tabId: target.tabId,
    tabTitle: target.title,
    createdTab,
    tags,
    message:
      (createdTab
        ? `Created the ${tagTitle} tab and saved the note there on its own page.`
        : `Saved to ${target.title} on a new page.`) +
      (privateImageLink ? ' Image attached as a private Google Drive link.' : '') +
      imageLinkMessage,
  };
}
