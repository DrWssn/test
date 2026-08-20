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

    const requests: Record<string, unknown>[] = [];
    if (!target) {
      requests.push({ createTab: { tabProperties: { title: tagTitle } } });
      createdTab = true;
    }

    const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    const entry = `\n[${timestamp}]\n${parsed.data.text.trim()}\n`;
    if (target) {
      const last = target.bodyContent.at(-1);
      const insertionIndex = Math.max(1, Number(last?.endIndex || 2) - 1);
      requests.push({
        insertText: {
          location: { tabId: target.tabId, index: insertionIndex },
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
        message: createdTab
          ? "The note tab could not be created. Check that this document is editable."
          : "The note could not be added. Check that this document is editable.",
      });
      return;
    }

    if (createdTab) {
      const refreshedResponse = await googleDocsRequest(
        `/v1/documents/${encodeURIComponent(parsed.data.documentId)}?includeTabsContent=true`,
        { method: "GET" },
      );
      if (refreshedResponse.ok) {
        tabs = extractTabs(await refreshedResponse.json());
        target = tabs.find((tab) => tab.title.toLowerCase() === tagTitle.toLowerCase());
      }
    }

    const response = SubmitNoteResponse.parse({
      documentId: parsed.data.documentId,
      tabId: target?.tabId || "",
      tabTitle: target?.title || tagTitle,
      createdTab,
      tags,
      message: `Saved to ${target?.title || tagTitle}.`,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Google Docs note request failed");
    res.status(502).json({ message: "Google Docs is unavailable right now." });
  }
});

export default router;