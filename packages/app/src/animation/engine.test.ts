import { expect, it, vi } from 'vitest';
import { animationArguments, animationEngine } from './engine';
import { DEFAULT_RADIAL_SELECTION } from '@pic-forge/codecs';

it('requires resetting active local edits on animations but accepts a neutral selection', () => {
  const meta = { format: 'gif' as const, width: 2, height: 2, ends: [100, 200], plays: 0 };
  const settings = {
    outputFormat: 'webp' as const,
    quality: 75,
    localAdjustment: {
      selection: { ...DEFAULT_RADIAL_SELECTION },
      adjustments: { exposure: 20 },
    },
  };
  expect(() => animationArguments(meta, settings)).toThrow('Animation: adjustments');
  expect(() =>
    animationArguments(meta, {
      ...settings,
      localAdjustment: {
        ...settings.localAdjustment,
        adjustments: {},
      },
    }),
  ).not.toThrow();
});

it('refuses active color edits rather than silently exporting an unchanged animation', () => {
  const meta = { format: 'gif' as const, width: 2, height: 2, ends: [100, 200], plays: 0 };
  expect(() =>
    animationArguments(meta, { outputFormat: 'webp', quality: 75, adjustments: { exposure: 20 } }),
  ).toThrow('Animation: adjustments');
  expect(() =>
    animationArguments(meta, { outputFormat: 'webp', quality: 75, adjustments: { exposure: 0 } }),
  ).not.toThrow();
});
import type { AnimationMetadata } from '@pic-forge/worker';
const meta: AnimationMetadata = {
  format: 'gif',
  width: 100,
  height: 50,
  ends: [70, 200, 440],
  plays: 3,
};

it('preserves variable timing, loops, quality and source geometry without imposing fps', () => {
  const { args, width, height } = animationArguments(meta, {
    outputFormat: 'webp',
    quality: 73,
    advanced: { lossless: 1, method: 6 },
    resize: {
      enabled: true,
      mode: 'absolute',
      method: 'cover',
      maxWidth: 20,
      maxHeight: 20,
      percentage: 50,
    },
  });
  expect([width, height]).toEqual([20, 20]);
  expect(args.join(' ')).toContain(
    'crop=50:50:25:0,format=gbrap16le,premultiply=inplace=1,scale=20:20:flags=lanczos,unpremultiply=inplace=1',
  );
  expect(args.join(' ')).toContain('-fps_mode passthrough -enc_time_base 1:1000');
  expect(args.join(' ')).toContain('-quality 73 -lossless 1 -compression_level 6 -loop 3');
  expect(args).not.toContain('-r');
});
it('rejects static exports, unqualified decoding and unsupported settings before loading engines', () => {
  expect(() => animationArguments(meta, { outputFormat: 'mozjpeg', quality: 75 })).toThrow(
    'Animation: format',
  );
  expect(() =>
    animationArguments({ ...meta, format: 'webp' }, { outputFormat: 'webp', quality: 75 }),
  ).toThrow('Animation: unsupported');
  expect(() =>
    animationArguments(meta, {
      outputFormat: 'webp',
      quality: 75,
      advanced: { alpha_quality: 30 },
    }),
  ).toThrow('Animation: settings');
});
it('does not start an already cancelled animation', async () => {
  const signal = AbortSignal.abort();
  await expect(
    animationEngine.process(
      {
        id: 'cancelled',
        source: new Blob(),
        animation: meta,
        settings: { outputFormat: 'webp', quality: 75 },
      },
      signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it('does not load a core if the progress subscriber cancels synchronously', async () => {
  const abort = new AbortController();
  const worker = vi.fn();
  vi.stubGlobal('Worker', worker);
  await expect(
    animationEngine.process(
      {
        id: 'cancel-on-progress',
        source: new Blob(),
        animation: meta,
        settings: { outputFormat: 'webp', quality: 75 },
        onProgress: () => abort.abort(),
      },
      abort.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
