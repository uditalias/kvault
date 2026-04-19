// Builds the sandboxed iframe srcdoc that runs user scripts. The iframe has
// no network access (no fetch/XHR/WebSocket — all shadowed to throw) and no
// DOM/storage access. The ONLY way it can reach Cloudflare is via the
// KVNamespace wrappers, which postMessage the parent, which invokes Rust.

export interface RuntimeBuildOptions {
  /** The transpiled user JS (from esbuild). Should not contain imports. */
  transpiledCode: string;
  /**
   * Binding identifier -> namespace id mapping that the runtime should build
   * the `env` object from. Identifiers are already normalized
   * (see envTypes.ts).
   */
  bindings: Array<{ ident: string; namespaceId: string }>;
}

const SANDBOX_ERROR_PREFIX = 'KVault playground:';
const LEARN_MORE_URL =
  'https://uditalias.github.io/kvault/docs/features/playground.html#limitations';

/**
 * Globals that must NOT be available inside the playground. Each is replaced
 * with a getter that throws a helpful message pointing at the docs. We allow
 * setTimeout/setInterval so trivial delays work, but the runManager clears
 * them when the run ends so nothing leaks.
 */
const SHADOWED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'navigator',
];

/** Named imports that we also shadow. `import()` is caught by esbuild's
 * format setting, but `require` we stub explicitly. */
const SHADOWED_CALLS = ['require'];

export function buildIframeSrcdoc(opts: RuntimeBuildOptions): string {
  const bindingsJson = JSON.stringify(opts.bindings);

  // Every single string inside <script> must avoid closing </script>. We
  // template with an inline IIFE that reads data from a JSON script tag.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline';">
<title>KVault Playground Sandbox</title>
</head>
<body>
<script id="kvault-bindings" type="application/json">${escapeForScriptTag(bindingsJson)}</script>
<script>
(function () {
  'use strict';
  var SANDBOX_ERROR_PREFIX = ${JSON.stringify(SANDBOX_ERROR_PREFIX)};
  var LEARN_MORE_URL = ${JSON.stringify(LEARN_MORE_URL)};
  var pendingRpc = new Map();
  var rpcCounter = 0;
  var timerHandles = new Set();

  function send(msg) {
    window.parent.postMessage(msg, '*');
  }

  // --- console proxy ------------------------------------------------------
  var originalConsole = {};
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    originalConsole[level] = console[level] && console[level].bind(console);
    console[level] = function () {
      try {
        var args = Array.prototype.slice.call(arguments).map(structuredCloneSafe);
        send({ kind: 'log', level: level, args: args });
      } catch (e) {
        // If args aren't serializable, fall back to strings
        send({ kind: 'log', level: level, args: Array.prototype.slice.call(arguments).map(String) });
      }
    };
  });

  function structuredCloneSafe(v) {
    // Primitives (including undefined) cross postMessage cleanly — pass through.
    // JSON-stringifying undefined yields the JS value undefined, and JSON.parse
    // on that throws, masking undefined as the string "undefined". Avoid.
    if (v === undefined || v === null) return v;
    var t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string' || t === 'bigint') return v;
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (_) {
      return String(v);
    }
  }

  // --- shadowed globals ---------------------------------------------------
  var SHADOWED = ${JSON.stringify(SHADOWED_GLOBALS)};
  SHADOWED.forEach(function (name) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () {
          throw new Error(
            SANDBOX_ERROR_PREFIX + ' ' + name +
            ' is not available. Playgrounds are for KV data, not general JS execution. Learn more: ' +
            LEARN_MORE_URL,
          );
        },
        set: function () { /* swallow */ },
      });
    } catch (e) { /* non-configurable, leave it */ }
  });

  var SHADOWED_CALLS = ${JSON.stringify(SHADOWED_CALLS)};
  SHADOWED_CALLS.forEach(function (name) {
    window[name] = function () {
      throw new Error(
        SANDBOX_ERROR_PREFIX + ' ' + name +
        '() is not available. Playgrounds are for KV data, not general JS execution. Learn more: ' +
        LEARN_MORE_URL,
      );
    };
  });

  // --- timers: wrap so they can be cleared on run-end --------------------
  var nativeSetTimeout = window.setTimeout.bind(window);
  var nativeClearTimeout = window.clearTimeout.bind(window);
  var nativeSetInterval = window.setInterval.bind(window);
  var nativeClearInterval = window.clearInterval.bind(window);
  window.setTimeout = function (cb, ms) {
    var capped = Math.min(Math.max(0, ms || 0), 30000);
    var id = nativeSetTimeout(function () { timerHandles.delete(id); cb.apply(null, Array.prototype.slice.call(arguments, 2)); }, capped);
    timerHandles.add(id);
    return id;
  };
  window.clearTimeout = function (id) { timerHandles.delete(id); nativeClearTimeout(id); };
  window.setInterval = function (cb, ms) {
    var capped = Math.min(Math.max(0, ms || 0), 30000);
    var id = nativeSetInterval(cb, capped);
    timerHandles.add(id);
    return id;
  };
  window.clearInterval = function (id) { timerHandles.delete(id); nativeClearInterval(id); };

  // --- RPC: iframe → parent → Rust ---------------------------------------
  function nextRpcId() {
    rpcCounter += 1;
    return 'rpc-' + rpcCounter;
  }
  function rpc(method, extra) {
    return new Promise(function (resolve, reject) {
      var id = nextRpcId();
      pendingRpc.set(id, { resolve: resolve, reject: reject });
      send(Object.assign({ kind: 'rpc', id: id, method: method }, extra));
    });
  }

  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    if (!msg || msg.kind !== 'rpc-reply') return;
    var pending = pendingRpc.get(msg.id);
    if (!pending) return;
    pendingRpc.delete(msg.id);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || 'RPC error'));
  });

  // --- value coercion helpers --------------------------------------------
  function bytesToArrayBuffer(bytes) {
    if (!bytes) return null;
    var arr = new Uint8Array(bytes);
    return arr.buffer;
  }
  function bytesToText(bytes) {
    if (!bytes) return null;
    var arr = new Uint8Array(bytes);
    return new TextDecoder('utf-8').decode(arr);
  }
  function bytesToJson(bytes) {
    var text = bytesToText(bytes);
    if (text === null) return null;
    return JSON.parse(text);
  }
  function bytesToStream(bytes) {
    if (!bytes) return null;
    var arr = new Uint8Array(bytes);
    return new ReadableStream({
      start: function (controller) { controller.enqueue(arr); controller.close(); },
    });
  }

  function coerceSingle(type, bytes) {
    if (bytes === null || bytes === undefined) return null;
    switch (type) {
      case 'arrayBuffer': return bytesToArrayBuffer(bytes);
      case 'stream': return bytesToStream(bytes);
      case 'json': return bytesToJson(bytes);
      case 'text':
      default:
        return bytesToText(bytes);
    }
  }

  async function valueToBytes(value) {
    if (typeof value === 'string') {
      return Array.from(new TextEncoder().encode(value));
    }
    if (value instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(value));
    }
    if (ArrayBuffer.isView(value)) {
      var v = value;
      return Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    }
    if (value && typeof value.getReader === 'function') {
      // ReadableStream — consume to bytes. postMessage can't carry streams.
      var reader = value.getReader();
      var chunks = [];
      var total = 0;
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        var chunk = r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value);
        chunks.push(chunk);
        total += chunk.length;
      }
      var out = new Uint8Array(total);
      var offset = 0;
      for (var i = 0; i < chunks.length; i++) {
        out.set(chunks[i], offset);
        offset += chunks[i].length;
      }
      return Array.from(out);
    }
    throw new Error(
      'KVNamespace.put: value must be string, ArrayBuffer, ArrayBufferView, or ReadableStream (got ' +
      typeof value + ')',
    );
  }

  // --- KVNamespace wrapper ------------------------------------------------
  var VALID_TYPES = ['text', 'json', 'arrayBuffer', 'stream'];

  function parseTypeArg(typeOrOptions, bulk) {
    if (typeOrOptions === undefined) return 'text';
    if (typeof typeOrOptions === 'string') return typeOrOptions;
    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      return typeOrOptions.type || 'text';
    }
    return 'text';
  }

  function validateType(type, allowStream) {
    if (VALID_TYPES.indexOf(type) === -1) {
      throw new Error(
        "KVNamespace.get: 'type' must be one of 'text'|'json'|'arrayBuffer'|'stream' (got '" +
        type + "')",
      );
    }
    if (!allowStream && type === 'stream') {
      throw new Error(
        "KVNamespace.get(keys[]): 'stream' type is not allowed in bulk reads (Cloudflare only supports 'text' or 'json')",
      );
    }
  }

  function KVNamespace(nsId) {
    this._nsId = nsId;
  }
  KVNamespace.prototype.get = async function (keyOrKeys, typeOrOptions) {
    var type = parseTypeArg(typeOrOptions, false);
    if (Array.isArray(keyOrKeys)) {
      validateType(type, false);
      var entries = await rpc('get', {
        namespaceId: this._nsId,
        keys: keyOrKeys,
        type: type,
      });
      var map = new Map();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        map.set(e.key, coerceSingle(type, e.data));
      }
      return map;
    } else {
      validateType(type, true);
      var res = await rpc('get', {
        namespaceId: this._nsId,
        keys: keyOrKeys,
        type: type,
      });
      return coerceSingle(type, res.data);
    }
  };
  KVNamespace.prototype.getWithMetadata = async function (keyOrKeys, typeOrOptions) {
    var type = parseTypeArg(typeOrOptions, false);
    if (Array.isArray(keyOrKeys)) {
      validateType(type, false);
      var entries = await rpc('getWithMetadata', {
        namespaceId: this._nsId,
        keys: keyOrKeys,
        type: type,
      });
      var map = new Map();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        map.set(e.key, { value: coerceSingle(type, e.data), metadata: e.metadata === undefined ? null : e.metadata });
      }
      return map;
    } else {
      validateType(type, true);
      var res = await rpc('getWithMetadata', {
        namespaceId: this._nsId,
        keys: keyOrKeys,
        type: type,
      });
      return { value: coerceSingle(type, res.data), metadata: res.metadata === undefined ? null : res.metadata };
    }
  };
  KVNamespace.prototype.put = async function (key, value, options) {
    if (typeof key !== 'string') {
      throw new Error("KVNamespace.put: 'key' must be a string");
    }
    var bytes = await valueToBytes(value);
    var opts = options || {};
    return rpc('put', {
      namespaceId: this._nsId,
      key: key,
      value: bytes,
      options: {
        expiration: opts.expiration,
        expirationTtl: opts.expirationTtl,
        metadata: opts.metadata,
      },
    });
  };
  KVNamespace.prototype['delete'] = async function (key) {
    if (typeof key !== 'string') {
      throw new Error("KVNamespace.delete: 'key' must be a string");
    }
    return rpc('delete', { namespaceId: this._nsId, key: key });
  };
  KVNamespace.prototype.list = async function (options) {
    var opts = options || {};
    return rpc('list', {
      namespaceId: this._nsId,
      options: {
        prefix: opts.prefix,
        limit: opts.limit,
        cursor: opts.cursor,
      },
    });
  };

  // --- bind env + self and run user code ---------------------------------
  var bindings = JSON.parse(document.getElementById('kvault-bindings').textContent);
  var envObj = {};
  for (var i = 0; i < bindings.length; i++) {
    var b = bindings[i];
    envObj[b.ident] = new KVNamespace(b.namespaceId);
  }
  Object.defineProperty(window, 'env', { value: envObj, writable: false, configurable: false });
  // self is normally the global. We keep it as the global for basic JS (so built-ins work)
  // but expose the bindings on it too so scripts using self.NS_TITLE still work.
  for (var ident in envObj) {
    if (Object.prototype.hasOwnProperty.call(envObj, ident)) {
      Object.defineProperty(self, ident, { value: envObj[ident], writable: false, configurable: false });
    }
  }

  // Cleanup of timers when parent tells us we're done
  window.addEventListener('message', function (ev) {
    if (ev.data && ev.data.kind === 'teardown') {
      timerHandles.forEach(function (id) { nativeClearTimeout(id); nativeClearInterval(id); });
      timerHandles.clear();
    }
  });

  send({ kind: 'ready' });

  // --- run user code ------------------------------------------------------
  // The transpiled code defines an async function __kvaultMain — we call it
  // and capture its return. Wrapping pre-transpile means top-level return
  // and await in the user's source are naturally inside an async function body.
  ${opts.transpiledCode}
  (async function () {
    try {
      var __kvaultResult = await __kvaultMain();
      // Cleanup residual timers so a script with a dangling setTimeout doesn't keep the iframe alive longer than needed
      timerHandles.forEach(function (id) { nativeClearTimeout(id); nativeClearInterval(id); });
      timerHandles.clear();
      send({ kind: 'done', returnValue: structuredCloneSafe(__kvaultResult) });
    } catch (err) {
      send({
        kind: 'error',
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : undefined,
      });
    }
  })();
})();
</script>
</body>
</html>`;
}

function escapeForScriptTag(json: string): string {
  // Prevent "</script>" inside JSON from closing the surrounding tag.
  return json.replace(/<\/script/gi, '<\\/script');
}
