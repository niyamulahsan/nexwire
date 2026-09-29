// Why: Redis Commander 0.4.5 bundles legacy `connect`/`serve-static`/`send`
//      whose `SendStream#isFresh` reads `http.ServerResponse#_headers`, which
//      Node removed in v15. Without this shim it crashes with:
//        TypeError: Cannot read properties of undefined (reading 'last-modified')
// When: Loaded via `node --require` before Redis Commander starts.
// Where: maker-cli redis:view launcher.
// How: Re-exposes `_headers` on the ServerResponse prototype, backed by the
//      modern `getHeaders()` API. Safe on older Node too (getHeaders is the
//      same data `_headers` used to return).
const http = require("node:http");

if (!("_headers" in http.ServerResponse.prototype)) {
  Object.defineProperty(http.ServerResponse.prototype, "_headers", {
    configurable: true,
    enumerable: false,
    get() {
      return this.getHeaders();
    }
  });
}
