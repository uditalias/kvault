# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # Install JS deps (also triggers Rust build on first tauri run)
npm run tauri dev        # Run full desktop app (Vite + Tauri + Rust backend)
npm run dev              # Vite-only (frontend dev server; Tauri APIs will fail)
npm run build            # Type-check (tsc) + Vite production build
npm run tauri build      # Build production desktop binary
```

There is no test suite, linter, or formatter configured. `npm run build` doubles as type-check (`tsc && vite build`).

## Architecture

KVault is a Tauri 2 desktop app: **Rust backend** (`src-tauri/`) + **React 19/TS frontend** (`src/`). The two halves communicate via Tauri's `invoke` (commands) and `emit`/`listen` (events).

### Rust backend (`src-tauri/src/`)

- `lib.rs` — entry. Opens a single SQLite connection, runs migrations, stores it as managed state `AppDb(Mutex<Connection>)`, and registers all `#[tauri::command]` handlers.
- `cloudflare/` — HTTP client for the Cloudflare API (accounts, namespaces, KV list/get/put/delete). `models.rs` has request/response shapes.
- `db/` — SQLite access. `migrations.rs` creates tables; per-domain files (`accounts`, `keys`, `filters`, `workspaces`) wrap queries. Key names are cached locally so listing/filtering/search is instant and offline; values are always fetched on-demand from Cloudflare.
- `commands/` — Tauri command handlers, one file per domain. These are the API surface the frontend calls.
- `keychain.rs` — Stores Cloudflare API tokens in the OS keychain (never in SQLite or plaintext). The `accounts` row only keeps the account metadata; the token is retrieved by account id at call time.
- `sync.rs` (in commands) — Background namespace key sync. Emits `sync-progress`, `sync-complete`, `sync-error` events on a per-namespace basis.

### Frontend (`src/`)

- **State: Zustand stores in `src/stores/`** — each slice of app state is an independent store. Key ones:
  - `accountStore` — accounts + `namespacesMap` (accountId → Namespace[])
  - `tabStore` — tabbed workspace; tabs have type `'namespace' | 'key' | 'settings' | ...`; preview tabs auto-replace
  - `keyStore` — per-namespace cached keys, selection, filters
  - `syncStore` — hooks into Rust sync events (wired once in `App.tsx` via `initEventListeners`)
  - `layoutStore` — panel/view state and cross-cutting dialog open flags (create-key, import, add-account, save-workspace)
  - `workspaceStore`, `settingsStore`, `searchStore`, `toastStore`
- **Tauri bridge: `src/lib/tauri.ts`** — the single place where the frontend talks to Rust. Every command and event listener is a typed wrapper around `invoke`/`listen`. Rust struct shapes are mirrored as TS interfaces here — keep them in sync with `src-tauri/src/**/models.rs` and command signatures.
- **`App.tsx`** — top-level shell. Mounts `PanelLayout`, `CommandPalette`, toasts, the save-workspace dialog, and wires global keyboard shortcuts (`useKeyboard`) plus a set of `window` custom events (`kvault:*`) used to decouple shortcut/command-palette actions from the components that handle them (e.g. `kvault:delete-selected`, `kvault:save-current-value`, `kvault:focus-key-filter`, `kvault:open-command-palette`).
- **Components** grouped by feature: `accounts/`, `keys/`, `editor/` (Monaco), `command-palette/`, `search/` (global search), `workspaces/`, `settings/`, `layout/`, `ui/`.
- **Virtualization** — large key lists use `@tanstack/react-virtual`.
- **Styling** — Tailwind CSS 4 via `@tailwindcss/vite`. Themes live in `src/themes/` and are applied to both Tailwind and Monaco.

### Cross-cutting patterns

- **Dialog-open race**: several callbacks in `App.tsx` reset `*DialogOpen` to `false` then set it `true` in `requestAnimationFrame`. This is intentional — it ensures the target component (e.g. `KeyList`) is mounted on the right tab before the dialog opens.
- **Custom `window` events (`kvault:*`)** are the convention for "fire an action without prop-drilling into the component that owns the state." Prefer this over threading refs/callbacks through the tree.
- **Binaries pass as `number[]`**: KV values cross the Tauri boundary as `Vec<u8>` ↔ `number[]`. `ValueResult` includes `is_json` and `size` so the frontend can branch between Monaco/hex viewer without re-parsing.

### Conventions

- `MEMORY.md` (auto-memory) notes: do not run `git add` / `git commit` unless explicitly asked.
