# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- Android APK: run the "Build Android APK" GitHub Actions workflow

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- App: Expo / React Native (`artifacts/medical-notes`)
- No backend: the app signs in with Google on the phone and calls the Drive and Docs APIs directly

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
