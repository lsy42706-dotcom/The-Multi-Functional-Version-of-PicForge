import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADJUSTMENTS,
  IMAGE_FILTERS,
  hasImageAdjustments,
  normalizeAdjustments,
} from '@pic-forge/codecs';
import { applyImageAdjustments } from './imageAdjustments';

describe('pixel adjustments', () => {
  it('keeps neutral edits byte-identical, including hidden transparent RGB', () => {
    const data = new Uint8ClampedArray([0, 255, 90, 0, 100, 50, 255, 128]);
    const before = data.slice();
    applyImageAdjustments(data, 2, 1, DEFAULT_ADJUSTMENTS);
    expect(data).toEqual(before);
  });
  it('exposure adds one stop in linear light rather than doubling sRGB bytes', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 77]);
    applyImageAdjustments(data, 1, 1, { exposure: 50 });
    expect([...data]).toEqual([176, 176, 176, 77]);
  });
  it('negative exposure darkens and all adjustments preserve alpha and hidden RGB', () => {
    const data = new Uint8ClampedArray([150, 90, 40, 0, 200, 180, 160, 128]);
    applyImageAdjustments(data, 2, 1, {
      exposure: -50,
      sharpness: 100,
      filter: 'warm',
      vignette: 80,
    });
    expect([...data.slice(0, 4)]).toEqual([150, 90, 40, 0]);
    expect(data[7]).toBe(128);
    expect(data[4]).toBeLessThan(200);
  });
  it('desaturates using luminance and vibrance does not color neutral gray', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    applyImageAdjustments(red, 1, 1, { saturation: -100 });
    expect([...red]).toEqual([54, 54, 54, 255]);
    const gray = new Uint8ClampedArray([128, 128, 128, 255]);
    applyImageAdjustments(gray, 1, 1, { vibrance: 100 });
    expect([...gray]).toEqual([128, 128, 128, 255]);
  });
  it('shadows target dark pixels and highlights target bright pixels', () => {
    const source = new Uint8ClampedArray([30, 30, 30, 255, 220, 220, 220, 255]);
    const shadows = source.slice(),
      highlights = source.slice();
    applyImageAdjustments(shadows, 2, 1, { shadows: 50 });
    applyImageAdjustments(highlights, 2, 1, { highlights: -50 });
    expect(shadows[0] - 30).toBeGreaterThan(shadows[4] - 220);
    expect(220 - highlights[4]).toBeGreaterThan(30 - highlights[0]);
  });
  it('brilliance opens shadows while temperature and tint have distinct axes', () => {
    const data = new Uint8ClampedArray([40, 40, 40, 255]);
    applyImageAdjustments(data, 1, 1, { brilliance: 50 });
    expect(data[0]).toBeGreaterThan(40);
    const warm = new Uint8ClampedArray([128, 128, 128, 255]);
    applyImageAdjustments(warm, 1, 1, { temperature: 50 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const tint = new Uint8ClampedArray([128, 128, 128, 255]);
    applyImageAdjustments(tint, 1, 1, { tint: 50 });
    expect(tint[0]).toBeGreaterThan(tint[1]);
    expect(tint[0]).toBe(tint[2]);
  });
  it('filter strength zero is identity and 50 interpolates the effect', () => {
    const source = new Uint8ClampedArray([100, 130, 180, 255]);
    const zero = source.slice(),
      half = source.slice(),
      full = source.slice();
    applyImageAdjustments(zero, 1, 1, { filter: 'noir', filterIntensity: 0 });
    applyImageAdjustments(half, 1, 1, { filter: 'noir', filterIntensity: 50 });
    applyImageAdjustments(full, 1, 1, { filter: 'noir' });
    expect(zero).toEqual(source);
    expect(full[0]).toBe(full[1]);
    expect(full[1]).toBe(full[2]);
    for (let c = 0; c < 3; c++)
      expect(Math.abs(half[c] - (source[c] + full[c]) / 2)).toBeLessThanOrEqual(1);
  });
  it.each(IMAGE_FILTERS.filter((filter) => filter !== 'original'))(
    '%s changes colored pixels while retaining alpha',
    (filter) => {
      const data = new Uint8ClampedArray([75, 120, 160, 99]);
      applyImageAdjustments(data, 1, 1, { filter });
      expect([...data.slice(0, 3)]).not.toEqual([75, 120, 160]);
      expect(data[3]).toBe(99);
    },
  );
  it('sharpens edges but leaves flat images and 1×1 images unchanged', () => {
    const flat = new Uint8ClampedArray(3 * 3 * 4).fill(128);
    const before = flat.slice();
    applyImageAdjustments(flat, 3, 3, { sharpness: 100 });
    expect(flat).toEqual(before);
    const edge = new Uint8ClampedArray([50, 50, 50, 255, 180, 180, 180, 255, 180, 180, 180, 255]);
    applyImageAdjustments(edge, 3, 1, { sharpness: 100 });
    expect(edge[0]).toBeLessThan(50);
    expect(edge[4]).toBeGreaterThan(180);
    const single = new Uint8ClampedArray([30, 40, 60, 150]);
    applyImageAdjustments(single, 1, 1, { sharpness: 100 });
    expect([...single]).toEqual([30, 40, 60, 150]);
  });
  it('darkens corners without darkening the center', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(200);
    applyImageAdjustments(pixels, 5, 5, { vignette: 100 });
    expect(pixels[0]).toBeLessThan(pixels[48]);
    expect(pixels[48]).toBe(200);
    expect(pixels[3]).toBe(200);
  });
  it('sanitizes nonfinite/out-of-range settings and rejects mismatched pixel dimensions', () => {
    expect(
      normalizeAdjustments({ exposure: Infinity, saturation: -500, filter: 'invalid' as never }),
    ).toMatchObject({ exposure: 0, saturation: -100, filter: 'original' });
    expect(hasImageAdjustments({ filter: 'warm', filterIntensity: 0 })).toBe(false);
    expect(() => applyImageAdjustments(new Uint8ClampedArray(4), 2, 2, { exposure: 1 })).toThrow(
      'dimensions',
    );
  });
});
