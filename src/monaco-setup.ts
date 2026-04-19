// Bundle Monaco Editor + its workers locally instead of fetching from a CDN.
// Required because Tauri's CSP forbids remote scripts in the packaged build,
// which would otherwise leave the editor stuck on "Loading…" forever.

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { loader } from '@monaco-editor/react';
import { openUrl } from '@tauri-apps/plugin-opener';

// KVault opens JSON/plain-text values AND TypeScript playground files. Skipping
// css/html workers keeps the bundle smaller, but we need the TS worker for the
// playground's type checking, autocomplete, and hover docs.
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Route http(s) link-clicks (Cmd/Ctrl+Click on a URL in the editor) through
// the Tauri opener plugin. Monaco's default opener calls `window.open`, which
// is a no-op inside a packaged Tauri webview — without this, clicking a URL
// in the editor does nothing.
monaco.editor.registerLinkOpener({
  open(resource) {
    const scheme = resource.scheme;
    if (scheme === 'http' || scheme === 'https') {
      void openUrl(resource.toString(true));
      return true;
    }
    return false;
  },
});

loader.config({ monaco });
