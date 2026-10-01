import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function googleDriveRequest(
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<Response> {
  return connectors.proxy("google-drive", path, options);
}

export async function uploadImageToDrive(
  bytes: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const boundary = `medical-notes-${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const uploadResponse = await googleDriveRequest(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!uploadResponse.ok) {
    throw new Error(`Drive image upload failed with ${uploadResponse.status}`);
  }

  const uploaded = await uploadResponse.json() as { id?: string; webViewLink?: string };
  if (!uploaded.id) throw new Error("Drive image upload returned no file ID");

  // Keep the image private in the user's Drive. The Google Doc receives a
  // private file link instead of publicly sharing potentially sensitive images.
  return uploaded.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view`;
}