import { Router, type IRouter } from "express";
import { ListDriveDocumentsResponse } from "@workspace/api-zod";
import { googleDriveRequest } from "../lib/google-drive";

const router: IRouter = Router();

router.get("/drive-documents", async (req, res) => {
  try {
    const params = new URLSearchParams({
      q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
      fields: "files(id,name,modifiedTime,webViewLink)",
      pageSize: "100",
      orderBy: "modifiedTime desc",
    });
    const response = await googleDriveRequest(`/drive/v3/files?${params.toString()}`, { method: "GET" });
    if (!response.ok) {
      req.log.error({ status: response.status }, "Google Drive list failed");
      res.status(502).json({ message: "Google Drive could not list your documents." });
      return;
    }
    const data = await response.json() as { files?: Array<Record<string, unknown>> };
    res.json(ListDriveDocumentsResponse.parse({
      files: Array.isArray(data?.files)
        ? data.files.map((file: any) => ({
            id: String(file.id),
            name: String(file.name || "Untitled document"),
            modifiedTime: String(file.modifiedTime || ""),
            webViewLink: String(file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`),
          }))
        : [],
    }));
  } catch (error) {
    req.log.error({ err: error }, "Google Drive list request failed");
    res.status(502).json({ message: "Google Drive is unavailable right now." });
  }
});

export default router;