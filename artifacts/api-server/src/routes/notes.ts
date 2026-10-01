import { Router, type IRouter } from "express";
import { SubmitNoteBody, SubmitNoteResponse } from "@workspace/api-zod";
import { extractTabs, googleDocsRequest } from "../lib/google-docs";
import { uploadImageToDrive } from "../lib/google-drive";

const router: IRouter = Router();
const tagPattern = /#[a-zA-Z][a-zA-Z0-9_-]*/g;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizedTag(tag: string): string {
  return tag.slice(1).replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
}

router.post("/notes", async (req, res) => {
  const parsed = SubmitNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Write a note before sending it." });
    return;
  }

  const tags = [...new Set(parsed.data.text.match(tagPattern) || [])];
  if (tags.length === 0) {
    res.status(400).json({ message: "Add a specialty tag such as #cardiology." });
    return;
  }

  const tagTitle = normalizedTag(tags[0]);
  const noteText = parsed.data.text.replace(tags[0], "").trim();
  try {
    const documentResponse = await googleDocsRequest(
      `/v1/documents/${encodeURIComponent(parsed.data.documentId)}?includeTabsContent=true`,
      { method: "GET" },
    );
    if (!documentResponse.ok) {
      res.status(502).json({ message: "We could not open that Google Doc." });
      return;
    }

    const document = await documentResponse.json();
    let tabs = extractTabs(document);
    let target = tabs.find((tab) => tab.title.toLowerCase() === tagTitle.toLowerCase());
    let createdTab = false;

    if (!target) {
      const addTabResponse = await googleDocsRequest(
        `/v1/documents/${encodeURIComponent(parsed.data.documentId)}:batchUpdate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{ addDocumentTab: { tabProperties: { title: tagTitle } } }],
          }),
        },
      );
      if (!addTabResponse.ok) {
        req.log.error({ status: addTabResponse.status }, "Google Docs specialty tab creation failed");
        res.status(502).json({
          message: `We could not create the ${tagTitle} tab. Check that this document is editable.`,
        });
        return;
      }

      const addTabResult = await addTabResponse.json() as {
        replies?: Array<{ addDocumentTab?: { tabProperties?: { tabId?: string } } }>;
      };
      const createdTabId = addTabResult.replies?.[0]?.addDocumentTab?.tabProperties?.tabId;
      if (!createdTabId) {
        req.log.error("Google Docs did not return the created specialty tab ID");
        res.status(502).json({ message: `The ${tagTitle} tab was created, but the note could not be routed.` });
        return;
      }

      const refreshedDocumentResponse = await googleDocsRequest(
        `/v1/documents/${encodeURIComponent(parsed.data.documentId)}?includeTabsContent=true`,
        { method: "GET" },
      );
      if (!refreshedDocumentResponse.ok) {
        req.log.error({ status: refreshedDocumentResponse.status }, "Google Docs tab refresh failed");
        res.status(502).json({ message: `The ${tagTitle} tab was created, but the note could not be routed.` });
        return;
      }

      tabs = extractTabs(await refreshedDocumentResponse.json());
      target = tabs.find((tab) => tab.tabId === createdTabId);
      if (!target) {
        req.log.error("Google Docs created tab was not present in the refreshed document");
        res.status(502).json({ message: `The ${tagTitle} tab was created, but the note could not be routed.` });
        return;
      }
      createdTab = true;
    }

    let privateImageLink: string | undefined;
    if (parsed.data.imageBase64) {
      const mimeType = parsed.data.imageMimeType || "image/jpeg";
      if (!allowedImageTypes.has(mimeType)) {
        res.status(400).json({ message: "Only JPG, PNG, and WebP images are supported." });
        return;
      }
      const imageBytes = Buffer.from(parsed.data.imageBase64, "base64");
      if (imageBytes.length > 7_500_000) {
        res.status(413).json({ message: "That image is too large. Choose an image under 7.5 MB." });
        return;
      }
      privateImageLink = await uploadImageToDrive(
        imageBytes,
        mimeType,
        parsed.data.imageName || `medical-note-${Date.now()}.jpg`,
      );
    }

    let publicImageUrl: string | undefined;
    if (parsed.data.imageUrl) {
      try {
        const url = new URL(parsed.data.imageUrl);
        if (url.protocol !== "https:" || url.toString().length > 2048) {
          res.status(400).json({ message: "Use a direct HTTPS image link." });
          return;
        }
        publicImageUrl = url.toString();
      } catch {
        res.status(400).json({ message: "That image link is not valid." });
        return;
      }
    }

    const prefix = createdTab ? "" : "\n";
    const attachmentLabel = privateImageLink ? "Image attachment" : "";
    const attachmentBlock = attachmentLabel ? `\n${attachmentLabel}` : "";
    const entry = `${prefix}${noteText}${attachmentBlock}\n`;
    const last = target.bodyContent.at(-1);
    const insertionIndex = Math.max(1, Number(last?.endIndex || 2) - 1);
    const requests: Record<string, unknown>[] = [{
      insertText: {
        location: target.tabId
          ? { tabId: target.tabId, index: insertionIndex }
          : { index: insertionIndex },
        text: entry,
      },
    }];
    if (privateImageLink) {
      requests.push({
        updateTextStyle: {
          range: {
            ...(target.tabId ? { tabId: target.tabId } : {}),
            startIndex: insertionIndex + entry.length - attachmentLabel.length - 1,
            endIndex: insertionIndex + entry.length - 1,
          },
          textStyle: { link: { url: privateImageLink } },
          fields: "link",
        },
      });
    }

    const updateResponse = await googleDocsRequest(
      `/v1/documents/${encodeURIComponent(parsed.data.documentId)}:batchUpdate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      },
    );
    if (!updateResponse.ok) {
      req.log.error({ status: updateResponse.status }, "Google Docs note update failed");
      res.status(502).json({
        message: "The note could not be added. Check that this document is editable.",
      });
      return;
    }

    let imageLinkMessage = "";
    if (publicImageUrl) {
      const last = target.bodyContent.at(-1);
      const insertionIndex = Math.max(1, Number(last?.endIndex || 2) - 1) + entry.length;
      const imageResponse = await googleDocsRequest(
        `/v1/documents/${encodeURIComponent(parsed.data.documentId)}:batchUpdate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{
              insertInlineImage: {
                location: target.tabId
                  ? { tabId: target.tabId, index: insertionIndex }
                  : { index: insertionIndex },
                uri: publicImageUrl,
                objectSize: {
                  height: { magnitude: 240, unit: "PT" },
                  width: { magnitude: 360, unit: "PT" },
                },
              },
            }],
          }),
        },
      );
      if (!imageResponse.ok) {
        imageLinkMessage = " The note was saved, but Docs could not embed that link; try attaching the image file instead.";
      }
    }

    const response = SubmitNoteResponse.parse({
      documentId: parsed.data.documentId,
      tabId: target.tabId,
      tabTitle: target.title,
      createdTab,
      tags,
      message: (createdTab
        ? `Created the ${tagTitle} tab and saved the note there.`
        : `Saved to ${tagTitle}.`)
        + (privateImageLink ? " Image attached as a private Google Drive link." : "")
        + imageLinkMessage,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Google Docs note request failed");
    res.status(502).json({ message: "Google Docs is unavailable right now." });
  }
});

export default router;