import { describe, expect, it } from 'vitest';
import { DEFAULT_RADIAL_SELECTION, type CompressSettings } from '@pic-forge/codecs';
import {
  applyPresetSettings,
  cloneSettings,
  getSettingsHash,
  mergeSettings,
  normalizeSettings,
} from './settingsUtils';

const base: CompressSettings = { outputFormat: 'mozjpeg', quality: 75 };
describe('adjustment snapshots', () => {
  it('keeps local snapshots independent and invalidates exports for geometry changes', () => {
    const edited = mergeSettings(base, {
      localAdjustment: {
        selection: { ...DEFAULT_RADIAL_SELECTION },
        adjustments: { exposure: 50 },
      },
    });
    const cloned = cloneSettings(edited);
    cloned.localAdjustment!.selection.x = 0.2;
    cloned.localAdjustment!.adjustments.exposure = 30;
    expect(edited.localAdjustment!.selection.x).toBe(0.5);
    expect(edited.localAdjustment!.adjustments.exposure).toBe(50);
    expect(getSettingsHash(cloned)).not.toBe(getSettingsHash(edited));
    expect(
      applyPresetSettings(edited, { outputFormat: 'oxipng', quality: 100 }).localAdjustment,
    ).toEqual(edited.localAdjustment);
    const removed = mergeSettings(edited, { localAdjustment: undefined });
    expect(removed.localAdjustment).toBeUndefined();
    expect(getSettingsHash(removed)).toBe(getSettingsHash(normalizeSettings(base)));
  });
  it('keeps an empty selection editable without changing export identity', () => {
    const neutral = mergeSettings(base, {
      localAdjustment: { selection: { ...DEFAULT_RADIAL_SELECTION }, adjustments: {} },
    });
    expect(neutral.localAdjustment).toBeDefined();
    expect(getSettingsHash(neutral)).toBe(getSettingsHash(normalizeSettings(base)));
  });
  it('retains a selected filter at zero strength while restoring the neutral export identity', () => {
    const zero = mergeSettings(base, { adjustments: { filter: 'warm', filterIntensity: 0 } });
    expect(zero.adjustments).toMatchObject({ filter: 'warm', filterIntensity: 0 });
    expect(getSettingsHash(zero)).toBe(getSettingsHash(normalizeSettings(base)));
    const active = mergeSettings(zero, { adjustments: { filterIntensity: 50 } });
    expect(active.adjustments!.filter).toBe('warm');
    expect(getSettingsHash(active)).not.toBe(getSettingsHash(zero));
  });
  it('clones edits independently so a custom image does not share global edits', () => {
    const global = mergeSettings(base, { adjustments: { exposure: 40, filter: 'warm' } });
    const snapshot = cloneSettings(global);
    snapshot.adjustments!.exposure = -20;
    expect(global.adjustments!.exposure).toBe(40);
  });
  it('preserves edits when changing output format, presets and individual sliders', () => {
    const edited = mergeSettings(base, { adjustments: { exposure: 30, filter: 'film' } });
    const next = mergeSettings(edited, { adjustments: { shadows: 50 } });
    expect(next.adjustments).toMatchObject({ exposure: 30, filter: 'film', shadows: 50 });
    expect(applyPresetSettings(next, { outputFormat: 'oxipng', quality: 100 }).adjustments).toEqual(
      next.adjustments,
    );
  });
  it('invalidates export hashes for edits and restores the original identity after reset', () => {
    const edited = mergeSettings(base, { adjustments: { exposure: 20 } });
    expect(getSettingsHash(edited)).not.toBe(getSettingsHash(normalizeSettings(base)));
    const reset = mergeSettings(edited, { adjustments: { exposure: 0 } });
    expect(getSettingsHash(reset)).toBe(getSettingsHash(normalizeSettings(base)));
  });
});
