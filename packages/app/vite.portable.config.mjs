import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import base from './vite.config.mjs';
import { STATIC_CODECS } from './scripts/static-codecs.mjs';

const root = dirname(fileURLToPath(import.meta.url));
function portableAssets() {
  return {
    name: 'picforge-portable-assets',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replaceAll('\\', '/');
      if (normalized.endsWith('/src/registerServiceWorker.ts')) {
        code = code.replace(
          'export function registerServiceWorker(): void {',
          'export function registerServiceWorker(): void { return;',
        );
      }
      if (normalized.endsWith('/src/utils/ffmpegAsset.ts')) {
        code = code.replace(
          "new URL('/wasm/ffmpeg-0.12.10/', origin)",
          "new URL('/wasm/ffmpeg-0.12.10/', 'https://picforge.invalid')",
        );
      }
      if (normalized.endsWith('/src/motion/heicWorker.ts')) {
        code = code.replace(
          'await import(/* @vite-ignore */ url)',
          "await globalThis.__pfImportFactory(url, 'heif')",
        );
      }
      if (normalized.endsWith('/src/animation/worker.ts')) {
        code = code.replace(
          'await import(/* @vite-ignore */ coreURL)',
          "await globalThis.__pfImportFactory(coreURL, 'ffmpeg')",
        );
      }
      code = code.replace(
        /new URL\((['"])(\/wasm\/[^'"]+)\1,\s*(?:self\.)?location\.origin\)\.href/g,
        (_match, _quote, asset) => `globalThis.__pfAssetUrl(${JSON.stringify(asset)})`,
      );
      const asset = STATIC_CODECS.find(({ glue }) => glue === normalized);
      if (asset) {
        code = code.replace(
          /new URL\((['"])([^'"]+\.wasm)\1,\s*import\.meta\.url\)/g,
          () => `globalThis.__pfAssetUrl('/wasm/${asset.name}')`,
        );
      }
      return { code, map: null };
    },
  };
}

export default defineConfig({
  ...base,
  root,
  publicDir: false,
  base: '/',
  plugins: [
    ...base.plugins.filter(
      (p) =>
        ![
          'picforge-static-codec-urls',
          'picforge-content-security-policy',
          'picforge-precache',
        ].includes(p.name),
    ),
    portableAssets(),
  ],
  worker: {
    format: 'es',
    plugins: () => [portableAssets()],
    rolldownOptions: { output: { codeSplitting: false } },
  },
  build: {
    ...base.build,
    outDir: resolve(root, '../../tmp/portable-app'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
