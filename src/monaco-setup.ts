// Bundle Monaco Editor + its workers locally instead of fetching from a CDN.
// Required because Tauri's CSP forbids remote scripts in the packaged build,
// which would otherwise leave the editor stuck on "Loading…" forever.

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { loader } from '@monaco-editor/react';

// KVault only ever opens JSON or plain-text values. Skipping css/html/ts
// workers keeps the bundle smaller.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });
