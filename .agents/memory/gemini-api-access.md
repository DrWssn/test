---
name: Gemini API access
description: Provider choice for Gemini features in the medical-notes app.
---

Use the user's own Gemini API key from server-side code. Do not retry Replit-managed Gemini AI setup unless the user explicitly asks.

**Why:** The user declined the managed setup flow and added their own Gemini API key to the Replit Secrets store.

**How to apply:** Read `GEMINI_API_KEY` only in the server process when a user invokes Gemini; never expose it in client code, logs, or chat.