import { Router, type IRouter } from "express";
import {
  CreateDocumentBody,
  CreateDocumentResponse,
  GetDocumentParams,
  GetDocumentResponse,
} from "@workspace/api-zod";
import { documentUrl, extractTabs, googleDocsRequest } from "../lib/google-docs";

const router: IRouter = Router();

function toDocumentInfo(document: any) {
  return {
    documentId: String(document.documentId),
    title: String(document.title || "Untitled document"),
    url: documentUrl(String(document.documentId)),
    tabs: extractTabs(document).map((tab) => ({
      tabId: tab.tabId,
      title: tab.title,
    })),
  };
}

router.post("/documents", async (req, res) => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Add a title for the document." });
    return;
  }

  try {
    const response = await googleDocsRequest("/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: parsed.data.title }),
    });
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Docs create failed");
      res.status(502).json({ message: "Google Docs could not create the document." });
      return;
    }
    const data = CreateDocumentResponse.parse(toDocumentInfo(await response.json()));
    res.status(201).json(data);
  } catch (error) {
    req.log.error({ err: error }, "Google Docs create request failed");
    res.status(502).json({ message: "Google Docs is unavailable right now." });
  }
});

router.get("/documents/:documentId", async (req, res) => {
  const parsed = GetDocumentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "That Google Doc ID is not valid." });
    return;
  }

  try {
    const response = await googleDocsRequest(
      `/v1/documents/${encodeURIComponent(parsed.data.documentId)}?includeTabsContent=true`,
      { method: "GET" },
    );
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Docs read failed");
      res.status(502).json({ message: "We could not open that Google Doc." });
      return;
    }
    res.json(GetDocumentResponse.parse(toDocumentInfo(await response.json())));
  } catch (error) {
    req.log.error({ err: error }, "Google Docs read request failed");
    res.status(502).json({ message: "Google Docs is unavailable right now." });
  }
});

export default router;