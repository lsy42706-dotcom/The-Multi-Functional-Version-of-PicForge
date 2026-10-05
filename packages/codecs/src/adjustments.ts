import type { ImageAdjustments, ImageFilter } from './types';

export const IMAGE_FILTERS: readonly ImageFilter[] = [
  'original',
  'vivid',
  'warm',
  'cool',
  'vintage',
  'film',
  'noir',
  'fade',
];

export const DEFAULT_ADJUSTMENTS: Readonly<ImageAdjustments> = {
  filter: 'original',
  filterIntensity: 100,
  exposure: 0,
  brilliance: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  vignette: 0,
};

export function normalizeAdjustments(input?: Partial<ImageAdjustments>): ImageAdjustments {
  const result = { ...DEFAULT_ADJUSTMENTS };
  if (!input) return result;
  if (IMAGE_FILTERS.includes(input.filter as ImageFilter)) result.filter = input.filter!;
  for (const key of Object.keys(DEFAULT_ADJUSTMENTS) as Array<keyof ImageAdjustments>) {
    if (key === 'filter') continue;
    const value = input[key];
    const min = ['sharpness', 'vignette', 'filterIntensity'].includes(key) ? 0 : -100;
    if (typeof value === 'number' && Number.isFinite(value))
      result[key] = Math.max(min, Math.min(100, Math.round(value)));
  }
  return result;
}

export function hasImageAdjustments(input?: Partial<ImageAdjustments>): boolean {
  if (!input) return false;
  const a = normalizeAdjustments(input);
  return (
    (a.filter !== 'original' && a.filterIntensity > 0) ||
    Object.keys(DEFAULT_ADJUSTMENTS).some(
      (key) =>
        key !== 'filter' && key !== 'filterIntensity' && a[key as keyof ImageAdjustments] !== 0,
    )
  );
}
