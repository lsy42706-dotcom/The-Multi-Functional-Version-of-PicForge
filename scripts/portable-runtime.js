/* Worker-safe runtime: every codec and module resolves to an embedded local Blob. */
function installPortableRuntime(resources) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const byUrl = new Map(
    Object.values(resources).flatMap((asset) => [
      [asset.url, asset],
      ...(asset.alias ? [[asset.alias, asset]] : []),
    ]),
  );
  const pending = new Map();
  let requestId = 0;
  if (typeof document === 'undefined') {
    const processMessage = self.onmessage;
    self.onmessage = (event) => {
      if (event.data?.__pfFetchReply || event.data?.__pfInit) return;
      return processMessage?.call(self, event);
    };
    self.addEventListener(
      'message',
      (event) => {
        if (!event.data?.__pfFetchReply) return;
        event.stopImmediatePropagation();
        const waiting = pending.get(event.data.id);
        if (!waiting) return;
        pending.delete(event.data.id);
        if (event.data.error) waiting.reject(new TypeError(event.data.error));
        else
          waiting.resolve(
            new Response(event.data.bytes, { headers: { 'Content-Type': event.data.mime } }),
          );
      },
      { capture: true },
    );
  }
  const find = (input) => {
    const value = input instanceof Request ? input.url : String(input);
    if (byUrl.has(value)) return byUrl.get(value);
    try {
      return resources[new URL(value, 'https://picforge.invalid').pathname];
    } catch {
      return undefined;
    }
  };
  if (typeof document === 'undefined' && typeof importScripts === 'function') {
    const nativeImportScripts = globalThis.importScripts.bind(globalThis);
    globalThis.importScripts = (...urls) =>
      nativeImportScripts(...urls.map((url) => find(url)?.url || url));
  }
  globalThis.__pfAssetUrl = (name) => {
    const resource = find(name);
    if (!resource) throw new Error(`Missing embedded resource: ${name}`);
    return resource.url;
  };
  globalThis.fetch = async (input, init) => {
    const resource = find(input);
    if (resource) {
      const response = await nativeFetch(resource.url, init);
      if (!resource.gzip) return response;
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip')), {
        headers: { 'Content-Type': resource.mime },
      });
    }
    const url = input instanceof Request ? input.url : String(input);
    if (/^(?:blob:|data:)/.test(url)) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        if (typeof document !== 'undefined' || init?.signal?.aborted) throw error;
        return new Promise((resolve, reject) => {
          const id = ++requestId;
          pending.set(id, { resolve, reject });
          self.postMessage({ __pfFetch: true, id, url });
        });
      }
    }
    throw new TypeError('This single-file edition uses embedded resources only.');
  };
  globalThis.__PF_PORTABLE__ = true;
  globalThis.__pfImportFactory = async (url, kind) => {
    importScripts(url);
    return { default: kind === 'heif' ? globalThis.__pfHeif : globalThis.createFFmpegCore };
  };
  // Classic Blob workers also work with the opaque origin of a file:// document.
  if (typeof document !== 'undefined') {
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, { ...options, type: 'classic' });
        const name = globalThis.__pfWorkerNames.get(String(url)) || '';
        const needed = (key) =>
          name.includes('imageWorker')
            ? /^\/wasm\/(?!ffmpeg|heif)/.test(key)
            : name.includes('heicWorker')
              ? key.startsWith('/wasm/heif-')
              : name.includes('videoWorker')
                ? false
                : key.startsWith('/wasm/ffmpeg-');
        const assets = Object.entries(resources)
          .filter(([key]) => needed(key))
          .map(([key, asset]) => ({
            key,
            bytes: asset.source,
            mime: asset.mime,
            gzip: asset.gzip,
            alias: asset.url,
          }));
        this.addEventListener('message', async (event) => {
          if (!event.data?.__pfFetch) return;
          event.stopImmediatePropagation();
          const { id, url: input } = event.data;
          try {
            const response = await globalThis.fetch(input);
            const bytes = await response.arrayBuffer();
            super.postMessage(
              {
                __pfFetchReply: true,
                id,
                bytes,
                mime: response.headers.get('Content-Type') || 'application/octet-stream',
              },
              [bytes],
            );
          } catch (error) {
            super.postMessage({ __pfFetchReply: true, id, error: String(error) });
          }
        });
        super.postMessage({ __pfInit: true, assets });
      }
    };
  }
}
