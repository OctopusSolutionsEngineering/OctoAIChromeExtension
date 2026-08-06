The amplitude SDK needs to be modified to prevent it from downloading remote source code. Prompt Claude to replace all instances of `loadScriptOnce` with a no-op function that does nothing.

For example:

```javascript
e.prototype.loadScriptOnce=function(e){return Promise.reject(new Error("Remote script loading is disabled in this extension (Manifest V3): "+e))}
```

The SDK should still be able to send analytics events, but it should not attempt to load any external scripts or resources.