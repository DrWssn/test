import { Router, type IRouter } from "express";
import { SubmitNoteBody, SubmitNoteResponse } from "@workspace/api-zod";
import { extractTabs, googleDocsRequest } from "../lib/google-docs";

const router: IRouter = Router();
const tagPattern = /#[a-zA-Z][a-zA-Z0-9_-]*/g;

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
    const exactTabFound = Boolean(target);

    const requests: Record<string, unknown>[] = [];
    // Google Docs currently exposes existing tabs to the API, but does not
    // support creating new document tabs through batchUpdate. Save safely in
    // the first tab until the user creates the specialty tab in Docs.
    target = target || tabs[0];

    const entry = exactTabFound
      ? `\n${noteText}\n`
      : `\n\n— ${tagTitle} —\n${noteText}\n`;
    if (target) {
      const last = target.bodyContent.at(-1);
      const insertionIndex = Math.max(1, Number(last?.endIndex || 2) - 1);
      const location = target.tabId
        ? { tabId: target.tabId, index: insertionIndex }
        : { index: insertionIndex };
      requests.push({
        insertText: {
          location,
          text: entry,
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

    const response = SubmitNoteResponse.parse({
      documentId: parsed.data.documentId,
      tabId: target?.tabId || "",
      tabTitle: exactTabFound ? tagTitle : "Document",
      createdTab: false,
      tags,
      message: exactTabFound
        ? `Saved to ${tagTitle}.`
        : `Saved under ${tagTitle} in the main document tab. Create a ${tagTitle} tab in Google Docs to route future notes there.`,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Google Docs note request failed");
    res.status(502).json({ message: "Google Docs is unavailable right now." });
  }
});

export default router;