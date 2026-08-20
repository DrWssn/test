---
name: Google Docs tabs integration
description: The connected Docs API is routed through the Replit connector and supports multi-tab reads/writes when tab IDs are included.
---

Use the Google Docs connector from the server, never directly from the mobile client. Read documents with includeTabsContent=true, walk nested tabs, and include tabId on index-based writes. A separate Drive connection is needed if the app must search/list a user's documents. Google Docs API currently cannot create organizational tabs through batchUpdate, so missing-tab notes need a clearly labeled main-tab fallback.

**Why:** The Docs API itself does not provide document search or tab creation, and multi-tab content is omitted unless explicitly requested.

**How to apply:** Keep document selection based on a pasted Docs URL/ID unless Drive is connected; route to existing specialty tabs and save under a labeled heading in the main tab when a specialty tab is missing.