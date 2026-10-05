import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRotateCcw } from 'react-icons/fi';
import {
  DEFAULT_ADJUSTMENTS,
  IMAGE_FILTERS,
  hasImageAdjustments,
  normalizeAdjustments,
  type CompressSettings,
  type ImageAdjustments,
  type ImageFilter,
  type LocalAdjustment,
  type RadialSelection,
  normalizeRadialSelection,
} from '@pic-forge/codecs';
import { applyImageAdjustments } from '@pic-forge/worker';
import { NumberControl } from './NumberControl';
import { SelectionRail } from './SelectionRail';
import { getRangeProgressStyle } from '../utils/rangeProgress';
import type { ImageFile } from '../types';
import sample from '../assets/dune-sample.jpg';

type AdjustmentKey = Exclude<keyof ImageAdjustments, 'filter'>;

function FilterGallery({
  source,
  value,
  onChange,
}: {
  source: string;
  value: ImageFilter;
  onChange: (filter: ImageFilter) => void;
}) {
  const { t } = useTranslation();
  const canvases = useRef<Partial<Record<ImageFilter, HTMLCanvasElement | null>>>({});
  useEffect(() => {
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      const target = canvases.current.original;
      if (cancelled || !target) return;
      const ctx = target.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const ratio = Math.max(
        target.width / image.naturalWidth,
        target.height / image.naturalHeight,
      );
      const width = image.naturalWidth * ratio,
        height = image.naturalHeight * ratio;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(image, (target.width - width) / 2, (target.height - height) / 2, width, height);
      const pixels = ctx.getImageData(0, 0, target.width, target.height);
      // Decode the photo once. Every filter works on only this 120×80 thumbnail.
      for (const filter of IMAGE_FILTERS) {
        const filtered = new ImageData(pixels.data.slice(), target.width, target.height);
        applyImageAdjustments(filtered.data, target.width, target.height, { filter });
        canvases.current[filter]?.getContext('2d')?.putImageData(filtered, 0, 0);
      }
    };
    image.onerror = () => {
      for (const canvas of Object.values(canvases.current))
        canvas?.getContext('2d')?.clearRect(0, 0, 120, 80);
    };
    image.src = source;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [source]);
  return (
    <div className="pf-filter-grid" role="group" aria-label={t('editing.filters')}>
      {IMAGE_FILTERS.map((filter) => (
        <button
          type="button"
          key={filter}
          className="pf-filter-option"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          <canvas
            ref={(element) => {
              canvases.current[filter] = element;
            }}
            width={120}
            height={80}
            aria-hidden="true"
          />
          <span>{t(`editing.filterNames.${filter}`)}</span>
        </button>
      ))}
    </div>
  );
}

/** Edits share the existing global/per-image snapshot and processing scheduler. */
export function AdjustmentPanel({
  settings,
  updateSettings,
  file,
  editingRegion,
  localAdjustment,
  onEditingRegionChange,
  updateLocalAdjustment,
}: {
  settings: CompressSettings;
  updateSettings: (partial: Partial<CompressSettings>) => void;
  file: ImageFile | null;
  editingRegion: boolean;
  localAdjustment?: LocalAdjustment;
  onEditingRegionChange: (editing: boolean) => void;
  updateLocalAdjustment: (localAdjustment: LocalAdjustment | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const a = normalizeAdjustments(
    editingRegion ? localAdjustment?.adjustments : settings.adjustments,
  );
  const update = (partial: Partial<ImageAdjustments>) => {
    if (editingRegion && localAdjustment)
      updateLocalAdjustment({ ...localAdjustment, adjustments: { ...a, ...partial } });
    else updateSettings({ adjustments: { ...a, ...partial } });
  };
  const selection = normalizeRadialSelection(localAdjustment?.selection);
  const updateSelection = (partial: Partial<RadialSelection>) => {
    if (localAdjustment)
      updateLocalAdjustment({
        ...localAdjustment,
        selection: normalizeRadialSelection({ ...selection, ...partial }),
      });
  };
  const geometryField = (key: 'radius' | 'feather' | 'x' | 'y') => (
    <div className="pf-field pf-adjustment-field" key={key}>
      <label htmlFor={`${id}-region-${key}`}>{t(`editing.region.${key}`)}</label>
      <div className="pf-range-field">
        <input
          id={`${id}-region-${key}`}
          type="range"
          min={key === 'radius' ? 1 : 0}
          max={100}
          value={Math.round(selection[key] * 100)}
          aria-label={t(`editing.region.${key}`)}
          style={getRangeProgressStyle(selection[key] * 100, key === 'radius' ? 1 : 0, 100)}
          onChange={(event) => updateSelection({ [key]: Number(event.target.value) / 100 })}
        />
        <NumberControl
          className="pf-number-value"
          min={key === 'radius' ? 1 : 0}
          max={100}
          value={Math.round(selection[key] * 100)}
          aria-label={t('editing.value', { name: t(`editing.region.${key}`) })}
          onValueChange={(value) => updateSelection({ [key]: value / 100 })}
        />
      </div>
    </div>
  );
  const changed = hasImageAdjustments(a) || a.filter !== 'original' || a.filterIntensity !== 100;
  const range = (key: AdjustmentKey) => {
    const min = ['sharpness', 'vignette', 'filterIntensity'].includes(key) ? 0 : -100;
    const disabled = key === 'filterIntensity' && a.filter === 'original';
    return (
      <div className="pf-field pf-adjustment-field" key={key}>
        <label htmlFor={`${id}-${key}`}>{t(`editing.${key}`)}</label>
        <div className="pf-range-field">
          <input
            id={`${id}-${key}`}
            type="range"
            min={min}
            max={100}
            step={1}
            value={a[key]}
            disabled={disabled}
            aria-label={t(`editing.${key}`)}
            aria-valuetext={key === 'exposure' ? `${(a[key] / 50).toFixed(2)} EV` : String(a[key])}
            style={getRangeProgressStyle(a[key], min, 100)}
            onChange={(event) => update({ [key]: Number(event.target.value) })}
            onDoubleClick={() => update({ [key]: DEFAULT_ADJUSTMENTS[key] })}
          />
          <NumberControl
            className="pf-number-value"
            min={min}
            max={100}
            disabled={disabled}
            value={a[key]}
            aria-label={t('editing.value', { name: t(`editing.${key}`) })}
            onValueChange={(value) => update({ [key]: value })}
          />
        </div>
      </div>
    );
  };
  return (
    <div className="pf-adjustment-panel" data-testid="adjustment-panel">
      <section className="pf-edit-group pf-region-settings" aria-label={t('editing.region.scope')}>
        <h3>{t('editing.region.scope')}</h3>
        <SelectionRail role="group" aria-label={t('editing.region.scope')}>
          <button
            type="button"
            aria-pressed={!editingRegion}
            onClick={() => onEditingRegionChange(false)}
          >
            {t('editing.region.whole')}
          </button>
          <button
            type="button"
            aria-pressed={editingRegion}
            disabled={!file}
            onClick={() => onEditingRegionChange(true)}
          >
            {t('editing.region.circle')}
          </button>
        </SelectionRail>
        {editingRegion ? (
          <>
            <SelectionRail role="group" aria-label={t('editing.region.target')}>
              <button
                type="button"
                aria-pressed={!selection.inverted}
                onClick={() => updateSelection({ inverted: false })}
              >
                {t('editing.region.inside')}
              </button>
              <button
                type="button"
                aria-pressed={selection.inverted}
                onClick={() => updateSelection({ inverted: true })}
              >
                {t('editing.region.outside')}
              </button>
            </SelectionRail>
            {geometryField('radius')}
            {geometryField('feather')}
            <details className="pf-settings-extra pf-edit-more">
              <summary>{t('editing.region.position')}</summary>
              <div>
                {geometryField('x')}
                {geometryField('y')}
              </div>
            </details>
            <p className="pf-field-hint">{t('editing.region.hint')}</p>
          </>
        ) : (
          localAdjustment && <p className="pf-field-hint">{t('editing.region.applied')}</p>
        )}
        {localAdjustment && (
          <button
            type="button"
            className="pf-text-button"
            onClick={() => {
              updateLocalAdjustment(undefined);
              onEditingRegionChange(false);
            }}
          >
            {t('editing.region.remove')}
          </button>
        )}
      </section>
      <div className="pf-edit-heading">
        <h3>{t('editing.filters')}</h3>
        <button
          type="button"
          className="pf-text-button"
          disabled={!changed}
          onClick={() => update({ ...DEFAULT_ADJUSTMENTS })}
        >
          <FiRotateCcw aria-hidden="true" />
          {t('editing.reset')}
        </button>
      </div>
      <FilterGallery
        source={file?.previewUrl ?? sample}
        value={a.filter}
        onChange={(filter) => update({ filter })}
      />
      {range('filterIntensity')}
      <section className="pf-edit-group" aria-labelledby={`${id}-light`}>
        <h3 id={`${id}-light`}>{t('editing.light')}</h3>
        {(['exposure', 'brilliance', 'highlights', 'shadows'] as const).map(range)}
        <details className="pf-settings-extra pf-edit-more">
          <summary>{t('editing.moreLight')}</summary>
          <div>{(['brightness', 'contrast', 'whites', 'blacks'] as const).map(range)}</div>
        </details>
      </section>
      <section className="pf-edit-group" aria-labelledby={`${id}-color`}>
        <h3 id={`${id}-color`}>{t('editing.color')}</h3>
        {(['saturation', 'vibrance', 'temperature', 'tint'] as const).map(range)}
      </section>
      <details className="pf-settings-extra pf-edit-more">
        <summary>{t('editing.detail')}</summary>
        <div>{(['sharpness', 'vignette'] as const).map(range)}</div>
      </details>
      <p className="pf-field-hint">{t('editing.hint')}</p>
    </div>
  );
}
