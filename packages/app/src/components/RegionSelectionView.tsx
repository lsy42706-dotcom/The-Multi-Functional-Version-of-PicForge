import { useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getRadialGeometry,
  normalizeRadialSelection,
  type RadialSelection,
} from '@pic-forge/codecs';

/** Selection interaction stays in the fitted output image, independent of comparison/zoom. */
export function RegionSelectionView({
  src,
  selection,
  width: outputWidth,
  height: outputHeight,
  onChange,
}: {
  src: string;
  selection: RadialSelection;
  width?: number;
  height?: number;
  onChange: (selection: RadialSelection) => void;
}) {
  const { t } = useTranslation();
  const [intrinsic, setIntrinsic] = useState({ width: 1, height: 1 });
  const width = outputWidth ?? intrinsic.width;
  const height = outputHeight ?? intrinsic.height;
  const [draft, setDraft] = useState<RadialSelection | null>(null);
  const draftRef = useRef<RadialSelection | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    mode: 'move' | 'draw' | 'resize';
    initial: RadialSelection;
  } | null>(null);
  const current = draft ?? selection;
  const g = getRadialGeometry(current, width, height);
  const radiusX = (g.radius / width) * 100;
  const radiusY = (g.radius / height) * 100;
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const setSelectionDraft = (next: RadialSelection) => {
    draftRef.current = normalizeRadialSelection(next);
    setDraft(draftRef.current);
  };
  const finish = (commit: boolean) => {
    if (commit && draftRef.current) onChange(draftRef.current);
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
  };
  const keyDown = (event: KeyboardEvent, mode: 'move' | 'resize') => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    let next: RadialSelection | null = null;
    if (mode === 'move') {
      if (event.key === 'ArrowLeft') next = { ...selection, x: selection.x - step };
      if (event.key === 'ArrowRight') next = { ...selection, x: selection.x + step };
      if (event.key === 'ArrowUp') next = { ...selection, y: selection.y - step };
      if (event.key === 'ArrowDown') next = { ...selection, y: selection.y + step };
    } else {
      if (['ArrowRight', 'ArrowUp', '+', '='].includes(event.key))
        next = { ...selection, radius: selection.radius + step };
      if (['ArrowLeft', 'ArrowDown', '-'].includes(event.key))
        next = { ...selection, radius: selection.radius - step };
    }
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      onChange(normalizeRadialSelection(next));
    }
  };
  return (
    <div className="pf-region-view" data-testid="region-view">
      <div
        className="pf-region-canvas"
        tabIndex={-1}
        style={
          {
            '--pf-source-width': `${width}px`,
            '--pf-source-aspect': width / height,
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          const p = point(event);
          const distance = Math.hypot((p.x - selection.x) * width, (p.y - selection.y) * height);
          const resize = (event.target as Element).closest('[data-region-resize]');
          const move = (event.target as Element).closest('[data-region-move]');
          const mode = resize ? 'resize' : move || distance <= g.radius ? 'move' : 'draw';
          const initial =
            mode === 'draw' ? { ...selection, x: p.x, y: p.y, radius: 0.01 } : selection;
          drag.current = { id: event.pointerId, x: p.x, y: p.y, mode, initial };
          event.currentTarget.setPointerCapture(event.pointerId);
          setSelectionDraft(initial);
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (!d || d.id !== event.pointerId) return;
          const p = point(event);
          setSelectionDraft(
            d.mode === 'move'
              ? { ...d.initial, x: d.initial.x + p.x - d.x, y: d.initial.y + p.y - d.y }
              : {
                  ...d.initial,
                  radius:
                    Math.hypot((p.x - d.initial.x) * width, (p.y - d.initial.y) * height) /
                    Math.min(width, height),
                },
          );
        }}
        onPointerUp={(event) => {
          if (drag.current?.id === event.pointerId) finish(true);
        }}
        onPointerCancel={() => finish(false)}
        onLostPointerCapture={() => finish(false)}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget) keyDown(event, 'move');
        }}
      >
        <img
          src={src}
          alt={t('editing.region.preview')}
          draggable={false}
          onLoad={(event) => {
            setIntrinsic({
              width: event.currentTarget.naturalWidth || 1,
              height: event.currentTarget.naturalHeight || 1,
            });
          }}
        />
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="pf-region-guide">
          <circle cx={g.x} cy={g.y} r={g.radius} className="pf-region-outline" />
          {current.feather > 0 && (
            <circle cx={g.x} cy={g.y} r={g.innerRadius} className="pf-region-feather" />
          )}
        </svg>
        <button
          type="button"
          className="pf-region-move"
          data-region-move
          aria-label={t('editing.region.move')}
          style={{
            left: `${current.x * 100}%`,
            top: `${current.y * 100}%`,
            width: `${radiusX * 2}%`,
            height: `${radiusY * 2}%`,
          }}
          onKeyDown={(event) => keyDown(event, 'move')}
        />
        <button
          type="button"
          className="pf-region-resize"
          data-region-resize
          aria-label={t('editing.region.resize')}
          style={{ left: `${current.x * 100 + radiusX}%`, top: `${current.y * 100}%` }}
          onKeyDown={(event) => keyDown(event, 'resize')}
        >
          <span aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
