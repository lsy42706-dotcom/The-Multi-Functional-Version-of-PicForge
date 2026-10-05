import { hasImageAdjustments, normalizeAdjustments } from './adjustments';
import type { LocalAdjustment, RadialSelection } from './types';

export const DEFAULT_RADIAL_SELECTION: Readonly<RadialSelection> = {
  x: 0.5,
  y: 0.5,
  radius: 0.25,
  feather: 0.35,
  inverted: false,
};

export function normalizeRadialSelection(input?: Partial<RadialSelection>): RadialSelection {
  const selection = { ...DEFAULT_RADIAL_SELECTION };
  for (const key of ['x', 'y', 'radius', 'feather'] as const) {
    const value = input?.[key];
    if (typeof value === 'number' && Number.isFinite(value))
      selection[key] =
        Math.round(Math.max(key === 'radius' ? 0.01 : 0, Math.min(1, value)) * 10000) / 10000;
  }
  selection.inverted = input?.inverted === true;
  return selection;
}

export function normalizeLocalAdjustment(input: LocalAdjustment): LocalAdjustment {
  return {
    selection: normalizeRadialSelection(input.selection),
    adjustments: normalizeAdjustments(input.adjustments),
  };
}

export function hasLocalAdjustment(input?: LocalAdjustment): boolean {
  return !!input && hasImageAdjustments(input.adjustments);
}

/** Shared by the visible circle and the export mask, including portrait images. */
export function getRadialGeometry(selection: RadialSelection, width: number, height: number) {
  const radius = selection.radius * Math.min(width, height);
  return {
    x: selection.x * width,
    y: selection.y * height,
    radius,
    innerRadius: radius * (1 - selection.feather),
  };
}
