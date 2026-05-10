<p align="center">
  <img src="public/xpense.svg" alt="Xpense Logo" width="100" />
</p>

<h1 align="center">Xpense</h1>

<p align="center">
  A small, fast, privacy-respecting expense splitter inspired by Tricount. Runs entirely
in your browser. No backend, no accounts, no telemetry — your data stays on your device
in IndexedDB.
</p>

## Features

- **Multi-group**: one workspace per trip, household, or shared event.
- **Custom members** with auto-assigned colors.
- **Flexible splits per expense**: equal, percent, exact amount, or parts (e.g. 1:2:1).
- **Multiple payers**: log one expense entry per payer for the same activity.
- **Currency per group** — EUR, USD, VND, GBP, JPY, AUD, CAD, CHF, SGD, THB, KRW, CNY.
- **Date per expense** to track when something was paid.
- **Bill photos** stored locally (IndexedDB blobs). Never uploaded.
- **Settlement view**: net balance per member + minimal-transfer suggestions.
- **Share link**: a URL that encodes the entire group (members, expenses, splits) into
  the URL hash. Open it on any device to reconstruct the same group. **Photos are not
  included** in shared links — they remain on the original device.
- **Dark mode**, responsive layout, keyboard-friendly.

## Run locally

```bash
pnpm install
pnpm dev
```

Build:

```bash
pnpm build
pnpm preview
```

Tests:

```bash
pnpm test
```

## How sharing works

When you generate a share link, the group's full state is `JSON.stringify`'d, compressed
with `lz-string`, base64url-encoded, and placed in the URL hash (`#g=...`). The hash is
never sent to any server — the receiving browser decodes it locally.

Image attachments are explicitly stripped before encoding. The share link contains a
count of stripped images so the recipient knows there were photos that didn't travel.

The receiver can either view the group read-only, or "Save a copy to this device" to
make it editable (with fresh ids so it doesn't collide with anything they already have).

## Where the data lives

- **Groups, members, expenses**: IndexedDB store `groups` (database `xpense`).
- **Images**: IndexedDB store `images` (same database).
- **Theme preference**: `localStorage["xpense-theme"]`.

To wipe everything, open browser devtools → Application → IndexedDB → delete the `xpense`
database, plus clear the `xpense-theme` localStorage entry.

## Tech

Vite 6, React 18, TypeScript, Tailwind CSS v3, shadcn/ui (Radix), Zustand, Dexie,
lz-string, react-router v6, Vitest.
