import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function googleDocsRequest(
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<Response> {
  return connectors.proxy("google-docs", path, options);
}

export function documentUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`;
}

export type GoogleTab = {
  tabId: string;
  title: string;
  bodyContent: Array<{ startIndex?: number; endIndex?: number }>;
};

function walkTabs(tabs: any[] | undefined): GoogleTab[] {
  if (!Array.isArray(tabs)) return [];
  return tabs.flatMap((tab) => {
    const properties = tab?.tabProperties;
    const current = properties?.tabId
      ? [{
          tabId: String(properties.tabId),
          title: String(properties.title || "Untitled"),
          bodyContent: Array.isArray(tab?.documentTab?.body?.content)
            ? tab.documentTab.body.content
            : [],
        }]
      : [];
    return [...current, ...walkTabs(tab?.childTabs)];
  });
}

export function extractTabs(document: any): GoogleTab[] {
  const tabs = walkTabs(document?.tabs);
  if (tabs.length > 0) return tabs;
  const fallback = document?.body?.content;
  return [{
    tabId: "",
    title: "Document",
    bodyContent: Array.isArray(fallback) ? fallback : [],
  }];
}