---
name: Google Docs tabs integration
description: The connected Docs API is routed through the Replit connector and supports multi-tab reads/writes when tab IDs are included.
---

Use the Google Docs connector from the server, never directly from the mobile client. Read documents with includeTabsContent=true, walk nested tabs, and include tabId on index-based writes. For a missing tab, batchUpdate with addDocumentTab and tabProperties.title, read the returned replies[].addDocumentTab.tabProperties.tabId, then re-fetch with includeTabsContent=true before writing. A separate Drive connection is still needed to search/list a user's documents.

**Why:** Current Google Docs REST docs include addDocumentTab, superseding the earlier assumption that batchUpdate could not create tabs. Multi-tab content is still omitted unless explicitly requested.

**How to apply:** Match existing tabs by title first; create a missing specialty tab by name and use the returned tab ID for all writes. If tab creation fails, return a clear error instead of silently routing the note into another tab. Use Drive for document discovery.