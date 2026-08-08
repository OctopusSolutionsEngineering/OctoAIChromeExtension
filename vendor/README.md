The amplitude SDK must be modified before it is bundled, because it ships two paths that
Manifest V3 classifies as remotely hosted code. Whenever the SDK is upgraded, reapply both
patches and re-run the verification below.

## 1. Disable remote script loading

Replace the body of `loadScriptOnce` so it never injects a `<script>` tag:

```javascript
e.prototype.loadScriptOnce=function(e){return Promise.reject(new Error("Remote script loading is disabled in this extension (Manifest V3): "+e))}
```

## 2. Disable remote code evaluation

`@amplitude/plugin-custom-enrichment-browser` takes a function body string delivered by
Amplitude's remote config API and compiles it with `new Function`. Replace that expression
with one that throws — the surrounding `try`/`catch` already falls back to an identity
function, so the SDK degrades safely:

```javascript
// before
var n=new Function("return "+t)();
// after
var n=(function(){throw new Error("Remote code evaluation is disabled in this extension (Manifest V3)")})();
```

`background.js` also passes `fetchRemoteConfig: false` and `customEnrichment: false` to
`amplitude.init`, which stops the remote config from being fetched at all. The bundle patch
is the part that matters for review, though: the Chrome Web Store scans the shipped bytes,
not the reachable subset.

## Verification

After patching, neither of these may return a hit:

```bash
grep -c 'new Function(' vendor/amplitude-browser.min.js
grep -oE 'createElement\(.{0,3}script' vendor/amplitude-browser.min.js
node --check vendor/amplitude-browser.min.js
```

The SDK should still be able to send analytics events, but it must not attempt to load any
external scripts or evaluate any remotely supplied code.
