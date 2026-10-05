import {
  hasImageAdjustments,
  normalizeAdjustments,
  type ImageAdjustments,
  type RadialSelection,
  getRadialGeometry,
  normalizeRadialSelection,
} from '@pic-forge/codecs';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** Same pixel pipeline for export and filter thumbnails; alpha is never edited.
 * Operates in place with a 256-entry exposure lookup and at most three scratch rows.
 * Each processing task starts from the original image, never a previously edited export.
 */
export function applyImageAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  input?: Partial<ImageAdjustments>,
  selection?: RadialSelection,
): void {
  if (!hasImageAdjustments(input)) return;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    data.length !== width * height * 4
  )
    throw new Error('Invalid adjustment pixel dimensions');
  const a = normalizeAdjustments(input);
  const exposure = 2 ** (a.exposure / 50);
  const table = Float64Array.from({ length: 256 }, (_, v) =>
    a.exposure === 0 ? v / 255 : srgb(linear(v / 255) * exposure),
  );
  const contrast = 2 ** (a.contrast / 100);
  const brilliance = a.brilliance / 100;
  const intensity = a.filter === 'original' ? 0 : a.filterIntensity / 100;
  const warmth = a.temperature * 0.0008;
  const tint = a.tint * 0.0006;
  const saturation = 1 + a.saturation / 100;
  const mask = selection ? createRadialMask(selection, width, height) : undefined;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const pixel = i / 4;
    const weight = mask ? mask(pixel % width, Math.floor(pixel / width)) : 1;
    if (weight === 0) continue;
    const originalR = data[i],
      originalG = data[i + 1],
      originalB = data[i + 2];
    let r = table[data[i]],
      g = table[data[i + 1]],
      b = table[data[i + 2]];
    const y = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const shadow = (1 - y) ** 2;
    const highlight = y ** 2;
    const tone =
      a.brightness * 0.002 +
      a.shadows * 0.0025 * shadow +
      a.highlights * 0.0025 * highlight +
      a.whites * 0.002 * y ** 4 +
      a.blacks * 0.002 * (1 - y) ** 4 +
      brilliance * (0.22 * shadow - 0.08 * highlight + 0.08 * Math.sin(Math.PI * y));
    r = clamp((r - 0.5) * contrast + 0.5 + tone + warmth + tint / 2);
    g = clamp((g - 0.5) * contrast + 0.5 + tone - tint);
    b = clamp((b - 0.5) * contrast + 0.5 + tone - warmth + tint / 2);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const sat =
      saturation * (1 + (a.vibrance / 100) * (1 - chroma) * 0.8) * (1 + brilliance * 0.08);
    r = clamp(luma + (r - luma) * sat);
    g = clamp(luma + (g - luma) * sat);
    b = clamp(luma + (b - luma) * sat);

    if (intensity > 0) {
      let fr = r,
        fg = g,
        fb = b;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      switch (a.filter) {
        case 'vivid':
          fr = (gray + (r - gray) * 1.3 - 0.5) * 1.12 + 0.5;
          fg = (gray + (g - gray) * 1.3 - 0.5) * 1.12 + 0.5;
          fb = (gray + (b - gray) * 1.3 - 0.5) * 1.12 + 0.5;
          break;
        case 'warm':
          fr = r * 1.04 + 0.045;
          fg = g + 0.012;
          fb = b * 0.95 - 0.025;
          break;
        case 'cool':
          fr = r * 0.96 - 0.02;
          fg = g + 0.015;
          fb = b * 1.04 + 0.045;
          break;
        case 'vintage':
          fr = r * 0.83 + g * 0.15 + 0.055;
          fg = g * 0.88 + r * 0.06 + 0.025;
          fb = b * 0.7 + g * 0.12 + 0.04;
          break;
        case 'film':
          fr = (r - 0.5) * 1.08 + 0.53;
          fg = (g - 0.5) * 1.06 + 0.505;
          fb = b * 0.82 + 0.07;
          break;
        case 'noir':
          fr = fg = fb = (gray - 0.5) * 1.2 + 0.5;
          break;
        case 'fade':
          fr = (gray + (r - gray) * 0.75) * 0.8 + 0.11;
          fg = (gray + (g - gray) * 0.75) * 0.8 + 0.11;
          fb = (gray + (b - gray) * 0.75) * 0.8 + 0.12;
          break;
      }
      r += (clamp(fr) - r) * intensity;
      g += (clamp(fg) - g) * intensity;
      b += (clamp(fb) - b) * intensity;
    }
    if (a.vignette > 0) {
      const pixel = i / 4;
      const x = (((pixel % width) + 0.5) / width) * 2 - 1;
      const yPos = ((Math.floor(pixel / width) + 0.5) / height) * 2 - 1;
      const edge = clamp((x * x + yPos * yPos - 0.15) / 1.85);
      const factor = 1 - (a.vignette / 100) * edge * edge * 0.85;
      r *= factor;
      g *= factor;
      b *= factor;
    }
    data[i] = originalR + (clamp(r) * 255 - originalR) * weight;
    data[i + 1] = originalG + (clamp(g) * 255 - originalG) * weight;
    data[i + 2] = originalB + (clamp(b) * 255 - originalB) * weight;
  }
  if (a.sharpness > 0) sharpen(data, width, height, (a.sharpness / 100) * 1.5, mask);
}

/** Pixel centres; smoothstep feather reaches zero exactly at the outer circle. */
export function createRadialMask(input: RadialSelection, width: number, height: number) {
  const selection = normalizeRadialSelection(input);
  const geometry = getRadialGeometry(selection, width, height);
  return (x: number, y: number) => {
    const distance = Math.hypot(x + 0.5 - geometry.x, y + 0.5 - geometry.y);
    let weight = distance <= geometry.innerRadius ? 1 : 0;
    if (distance < geometry.radius && distance > geometry.innerRadius) {
      const fraction = (geometry.radius - distance) / (geometry.radius - geometry.innerRadius);
      weight = fraction * fraction * (3 - 2 * fraction);
    }
    return selection.inverted ? 1 - weight : weight;
  };
}

/** Alpha-weighted unsharp mask. Rotating rows preserve unread source pixels. */
function sharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  mask?: (x: number, y: number) => number,
) {
  const stride = width * 4;
  let previous = data.slice(0, stride);
  let current = previous.slice();
  let next = data.slice(
    Math.min(1, height - 1) * stride,
    Math.min(1, height - 1) * stride + stride,
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = x * 4;
      const alpha = current[p + 3];
      const strength = amount * (mask ? mask(x, y) : 1);
      if (alpha === 0 || strength === 0) continue;
      const left = Math.max(0, x - 1) * 4;
      const right = Math.min(width - 1, x + 1) * 4;
      const weight =
        4 * alpha + current[left + 3] + current[right + 3] + previous[p + 3] + next[p + 3];
      for (let c = 0; c < 3; c++) {
        const blur =
          (4 * alpha * current[p + c] +
            current[left + 3] * current[left + c] +
            current[right + 3] * current[right + c] +
            previous[p + 3] * previous[p + c] +
            next[p + 3] * next[p + c]) /
          weight;
        data[y * stride + p + c] = current[p + c] + strength * (current[p + c] - blur);
      }
    }
    const recycled = previous;
    previous = current;
    current = next;
    next = recycled;
    // Last row repeats the unmodified current row at the image boundary.
    if (y + 2 < height) next.set(data.subarray((y + 2) * stride, (y + 3) * stride));
    else next.set(current);
  }
}
