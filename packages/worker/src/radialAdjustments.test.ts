import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RADIAL_SELECTION,
  normalizeRadialSelection,
  getRadialGeometry,
} from '@pic-forge/codecs';
import { applyImageAdjustments, createRadialMask } from './imageAdjustments';

const selection = { ...DEFAULT_RADIAL_SELECTION, x: 0.5, y: 0.5, radius: 0.4, feather: 0 };
function pixels() {
  return new Uint8ClampedArray(
    Array.from({ length: 25 }, (_, p) => [80 + p, 90, 100, p === 4 ? 0 : 120]).flat(),
  );
}
describe('radial local adjustments', () => {
  it('leaves every unselected byte and all alpha unchanged, including local sharpening', () => {
    const original = pixels();
    const edited = original.slice();
    const mask = createRadialMask(selection, 5, 5);
    applyImageAdjustments(edited, 5, 5, { exposure: 50, filter: 'warm', sharpness: 80 }, selection);
    for (let p = 0; p < 25; p++) {
      expect(edited[p * 4 + 3]).toBe(original[p * 4 + 3]);
      if (!mask(p % 5, Math.floor(p / 5)) || original[p * 4 + 3] === 0)
        expect(edited.slice(p * 4, p * 4 + 4)).toEqual(original.slice(p * 4, p * 4 + 4));
    }
    expect(edited.slice(12 * 4, 12 * 4 + 3)).not.toEqual(original.slice(12 * 4, 12 * 4 + 3));
  });
  it('inverts the circle without changing its centre or alpha', () => {
    const original = pixels();
    const edited = original.slice();
    applyImageAdjustments(edited, 5, 5, { exposure: 50 }, { ...selection, inverted: true });
    expect(edited.slice(48, 52)).toEqual(original.slice(48, 52));
    expect(edited[0]).toBeGreaterThan(original[0]);
    expect(edited[3]).toBe(original[3]);
  });
  it('smoothly blends the feather and uses pixel centres at a zero-strength outer edge', () => {
    const soft = { ...selection, radius: 0.4, feather: 0.5 };
    const mask = createRadialMask(soft, 10, 10);
    expect(mask(4.5, 4.5)).toBe(1);
    expect(mask(7.5, 4.5)).toBeCloseTo(0.5);
    expect(mask(8.5, 4.5)).toBe(0);
    const original = new Uint8ClampedArray(10 * 10 * 4).fill(128);
    const full = original.slice(),
      local = original.slice();
    applyImageAdjustments(full, 10, 10, { exposure: 50 });
    applyImageAdjustments(local, 10, 10, { exposure: 50 }, soft);
    const p = (4 * 10 + 7) * 4;
    expect(local[p]).toBeGreaterThan(original[p]);
    expect(local[p]).toBeLessThan(full[p]);
    expect(local[0]).toBe(original[0]);
  });
  it('keeps a true circle on portrait, landscape and resized outputs', () => {
    expect(getRadialGeometry(selection, 200, 100)).toEqual({
      x: 100,
      y: 50,
      radius: 40,
      innerRadius: 40,
    });
    expect(getRadialGeometry(selection, 100, 200)).toEqual({
      x: 50,
      y: 100,
      radius: 40,
      innerRadius: 40,
    });
    const large = createRadialMask(selection, 200, 100),
      small = createRadialMask(selection, 100, 50);
    expect(large(99.5, 49.5)).toBe(small(49.5, 24.5));
    expect(large(140.5, 49.5)).toBe(small(70.5, 24.5));
  });
  it('applies a local layer after whole-image edits and remains neutral when reset', () => {
    const original = pixels();
    const whole = original.slice();
    applyImageAdjustments(whole, 5, 5, { temperature: 30 });
    const local = whole.slice();
    applyImageAdjustments(local, 5, 5, { brightness: 30 }, selection);
    expect(local.slice(0, 4)).toEqual(whole.slice(0, 4));
    expect(local[48]).toBeGreaterThan(whole[48]);
    applyImageAdjustments(whole, 5, 5, {}, selection);
    expect(whole[48]).not.toBe(original[48]);
  });
  it('bounds invalid geometry while retaining precise positions', () => {
    expect(normalizeRadialSelection({ x: -1, y: 2, radius: 0, feather: Infinity })).toMatchObject({
      x: 0,
      y: 1,
      radius: 0.01,
      feather: 0.35,
    });
    expect(normalizeRadialSelection({ x: 0.123456 }).x).toBe(0.1235);
  });
});
