import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RADIAL_SELECTION, type CompressSettings } from '@pic-forge/codecs';
import { createCompatImageEngine } from './compatImageEngine';
import type { WorkerPool } from './workerPool';

const mocks = vi.hoisted(() => ({ encode: vi.fn(), decode: vi.fn() }));
vi.mock('@pic-forge/codecs', async (original) => ({
  ...(await original<typeof import('@pic-forge/codecs')>()),
  encodeImage: mocks.encode,
}));
vi.mock('./workerDecode', async (original) => ({
  ...(await original<typeof import('./workerDecode')>()),
  decodeAndResizeInWorker: mocks.decode,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('adjustments on the real encoding boundary', () => {
  it('encodes a real local mask on both decode paths for all four formats', async () => {
    vi.resetModules();
    const scope = {
      onmessage: undefined as unknown as (event: MessageEvent) => Promise<void>,
      postMessage: vi.fn(),
    };
    vi.stubGlobal('self', scope);
    await import('./imageWorker');
    mocks.encode.mockResolvedValue(new ArrayBuffer(4));
    for (const input of ['source', 'rgba'])
      for (const outputFormat of ['mozjpeg', 'webp', 'oxipng', 'avif']) {
        const data = new Uint8ClampedArray(
          Array.from({ length: 9 }, () => [128, 128, 128, 123]).flat(),
        );
        mocks.decode.mockResolvedValue({
          data,
          width: 3,
          height: 3,
          originalWidth: 3,
          originalHeight: 3,
        });
        await scope.onmessage({
          data: {
            type: 'task',
            payload: {
              id: 'local',
              input,
              pixelBuffer: data.buffer,
              source: new Blob(),
              width: 3,
              height: 3,
              settings: {
                outputFormat,
                quality: 75,
                localAdjustment: {
                  selection: { ...DEFAULT_RADIAL_SELECTION, radius: 0.2, feather: 0 },
                  adjustments: { exposure: 50 },
                },
              },
            },
          },
        } as MessageEvent);
        const encoded = mocks.encode.mock.calls.at(-1)![1] as Uint8ClampedArray;
        expect([...encoded.slice(16, 20)]).toEqual([176, 176, 176, 123]);
        expect([...encoded.slice(0, 4)]).toEqual([128, 128, 128, 123]);
      }
  });
  it('uses the same transform for source decoding and fallback RGBA before each encoder', async () => {
    vi.resetModules();
    const postMessage = vi.fn();
    const scope = {
      onmessage: undefined as unknown as (event: MessageEvent) => Promise<void>,
      postMessage,
    };
    vi.stubGlobal('self', scope);
    await import('./imageWorker');
    mocks.encode.mockImplementation(async () => new ArrayBuffer(4));
    for (const input of ['source', 'rgba']) {
      for (const outputFormat of ['mozjpeg', 'webp', 'oxipng', 'avif']) {
        const data = new Uint8ClampedArray([128, 128, 128, 123]);
        mocks.decode.mockResolvedValue({
          data,
          width: 1,
          height: 1,
          originalWidth: 1,
          originalHeight: 1,
        });
        await scope.onmessage({
          data: {
            type: 'task',
            payload: {
              input,
              id: 'edited',
              width: 1,
              height: 1,
              pixelBuffer: data.buffer,
              source: new Blob(),
              settings: { outputFormat, quality: 75, adjustments: { exposure: 50 } },
            },
          },
        } as MessageEvent);
        const call = mocks.encode.mock.calls.at(-1)!;
        expect(call[0]).toBe(outputFormat);
        expect([...call[1]]).toEqual([176, 176, 176, 123]);
        expect(postMessage.mock.calls.at(-1)![0].type).toBe('result');
      }
    }
  });
  it.each(['global', 'local'])(
    'bypasses PNG passthrough when %s edits must change pixels',
    async (layer) => {
      const passthrough = vi.fn();
      const decoded = vi.fn(async () => ({
        data: new Uint8ClampedArray([100, 100, 100, 255]),
        width: 1,
        height: 1,
        originalWidth: 1,
        originalHeight: 1,
      }));
      const pool = {
        enqueue: vi.fn((id, _buffer, _w, _h, _size, settings, callbacks) => {
          expect(
            layer === 'global'
              ? settings.adjustments.exposure
              : settings.localAdjustment.adjustments.exposure,
          ).toBe(50);
          callbacks.onResult(id, new ArrayBuffer(1), 4, 1);
        }),
      } as unknown as WorkerPool;
      const settings: CompressSettings = {
        outputFormat: 'oxipng',
        quality: 100,
        ...(layer === 'global'
          ? { adjustments: { exposure: 50 } }
          : {
              localAdjustment: {
                selection: { ...DEFAULT_RADIAL_SELECTION },
                adjustments: { exposure: 50 },
              },
            }),
      };
      const engine = createCompatImageEngine(() => pool, {
        canDecodeInWorker: () => false,
        decodeAndResizeImage: decoded,
        readPngPassthrough: passthrough,
      });
      await engine.process({
        id: 'png',
        source: new Blob(['png'], { type: 'image/png' }),
        settings,
      });
      expect(passthrough).not.toHaveBeenCalled();
      expect(decoded).toHaveBeenCalledOnce();
    },
  );
});
