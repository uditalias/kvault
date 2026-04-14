# Contributing to KVault

Thanks for your interest in contributing! Whether it's a bug fix, new feature, or documentation improvement — all contributions are welcome.

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **Rust** (stable) — [rustup.rs](https://www.rust-lang.org/tools/install)
- **Tauri CLI** system dependencies — follow the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Setup

```bash
git clone https://github.com/uditalias/kvault.git
cd kvault
npm install
```

### Development

```bash
# Full desktop app (Vite + Tauri + Rust backend)
npm run tauri dev

# Frontend-only Vite server (Tauri APIs will fail)
npm run dev

# Production build (outputs to src-tauri/target/release/bundle/)
npm run tauri build

# Type-check + frontend production build
npm run build
```

### Running Tests

```bash
# Rust unit tests
cd src-tauri && cargo test

# Clippy (the CI gate)
cd src-tauri && cargo clippy -- -D warnings
```

There is no frontend test suite yet — `npm run build` (`tsc && vite build`) doubles as a type-check.

## Project Structure

```
src/                   # React 19 + TypeScript frontend
├── components/        # Feature-grouped UI (accounts, keys, editor, command-palette, …)
├── stores/            # Zustand stores (one per slice of app state)
├── lib/tauri.ts       # Typed bridge to all Rust commands + events
├── hooks/             # Shared React hooks
└── themes/            # Theme tokens (Tailwind + Monaco)

src-tauri/             # Rust backend (Tauri 2)
├── src/
│   ├── lib.rs         # Entry point — opens SQLite, registers commands
│   ├── commands/      # Tauri command handlers (accounts, keys, sync, …)
│   ├── cloudflare/    # Cloudflare API HTTP client + models
│   ├── db/            # SQLite access (migrations + per-domain queries)
│   └── keychain.rs    # OS keychain wrapper for API tokens
└── tauri.conf.json    # Tauri app config (window, bundler, permissions)
```

See [CLAUDE.md](CLAUDE.md) for deeper architecture notes.

## How to Contribute

### Reporting Bugs

Open an [issue](https://github.com/uditalias/kvault/issues/new/choose) using the **Bug Report** template. Please include:

- Steps to reproduce
- Expected vs actual behavior
- KVault version, OS, and Rust/Node.js versions
- Relevant logs or screenshots

### Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
3. Make your changes
4. Run tests and clippy to make sure nothing is broken:
   ```bash
   cd src-tauri && cargo test && cargo clippy -- -D warnings
   npm run build
   ```
5. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add my feature"
   ```
6. Push to your fork:
   ```bash
   git push origin feature/my-feature
   ```
7. Open a [Pull Request](https://github.com/uditalias/kvault/pulls) against `main`

### Commit Messages

Use clear, descriptive commit messages. We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `chore:` — build, tooling, or dependency updates
- `release:` — version bump (produced by `npm run release`)

### Code Style

- **TypeScript** throughout the frontend — no `any` unless truly necessary
- **React 19** functional components with hooks
- **Zustand** for state — one store per slice, not a single global store
- **Tailwind CSS 4** for styling, **Radix UI** for primitives
- **Rust**: stable toolchain, `cargo clippy -- -D warnings` is the CI gate

### Key Conventions

- **Frontend ↔ Rust bridge**: every Tauri command and event lives in `src/lib/tauri.ts` with a typed wrapper. Rust struct shapes are mirrored as TS interfaces — keep them in sync when you add or change a command.
- **Tauri commands**: add the `#[tauri::command]` handler in `src-tauri/src/commands/<domain>.rs`, register it in the `invoke_handler![]` macro in `src-tauri/src/lib.rs`, and add a typed wrapper in `src/lib/tauri.ts`.
- **Secrets**: Cloudflare API tokens go through `keychain.rs` (OS keychain) — never store them in SQLite or plaintext.
- **`kvault:*` window events**: used to fire actions (e.g. `kvault:delete-selected`, `kvault:save-current-value`) without prop-drilling callbacks through the component tree.
- **Binary values**: KV values cross the Tauri boundary as `Vec<u8>` ↔ `number[]`. `ValueResult` carries `is_json` and `size` so the frontend can branch between Monaco and the hex viewer without re-parsing.

### Releasing

Releases are cut locally with `npm run release` (see [scripts/release.js](scripts/release.js)):

1. Bumps version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
2. Runs tests + type-check
3. Opens your editor on an auto-generated `CHANGELOG.md` entry
4. Commits and tags `vX.Y.Z`

Pushing the tag triggers `.github/workflows/release.yml`, which builds the Tauri app for all four platforms and uploads the artifacts to a GitHub Release.

## Questions?

Open an [issue](https://github.com/uditalias/kvault/issues) or start a [discussion](https://github.com/uditalias/kvault/discussions).
