import { useRef, useState, useCallback } from 'react';
import { Eraser } from 'lucide-react';

interface Props {
  value: string | null;                 // existing signature data URL
  onChange: (dataUrl: string | null) => void;
  name?: string;
  onNameChange?: (name: string) => void;
}

/**
 * Lightweight canvas signature pad. Captures pointer strokes and exports a
 * PNG data URL. Re-displays a saved signature as an image.
 *
 * The canvas is sized + its context configured in a ref callback so it is
 * (re)initialised every time the canvas element mounts — including after a
 * clear/redo, which previously left the remounted canvas un-sized and inert.
 */
/** Crop canvas to the tight bounding box of non-white pixels + padding. */
function exportCropped(canvas: HTMLCanvasElement): string {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      // Non-white pixel (background is #fff, ink is #1a1a1a)
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  if (minX > maxX || minY > maxY) return canvas.toDataURL('image/png'); // no ink

  const pad = Math.round(12 * (window.devicePixelRatio || 1));
  minX = Math.max(0, minX - pad);
  maxX = Math.min(w, maxX + pad);
  minY = Math.max(0, minY - pad);
  maxY = Math.min(h, maxY + pad);

  const cw = maxX - minX;
  const ch = maxY - minY;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out.toDataURL('image/png');
}

export default function SignaturePad({ value, onChange, name = '', onNameChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Stable identity (useCallback) so React only runs it when the canvas element
  // actually mounts/unmounts — NOT on every re-render, which would otherwise
  // resize (and clear) the canvas mid-signature and reset `dirty`.
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Guard against a zero-size box (e.g. mounted while hidden).
    const w = rect.width || 320;
    const h = rect.height || 96;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // White background so the PNG exports with legible dark ink on white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';
    }
    dirty.current = false;
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    dirty.current = true;
    setHasInk(true);
    const ctx = canvas.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    // Auto-save after every stroke — crop to ink bounds so PDF renders correctly
    if (dirty.current && canvasRef.current) {
      onChange(exportCropped(canvasRef.current));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.strokeStyle = '#1a1a1a';
    }
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  function redo() {
    drawing.current = false;
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  const nameInput = (
    <input
      type="text"
      value={name}
      onChange={e => onNameChange?.(e.target.value)}
      placeholder="Full name (printed)"
      className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 text-sm mt-2"
    />
  );

  // If a signature already exists, show it instead of the live pad.
  if (value) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-show-border bg-white p-2 flex items-center justify-between gap-3">
          <img src={value} alt="Client signature" className="h-16 object-contain" />
          <button
            onClick={redo}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-show-border text-slate-500 hover:text-red-400 text-xs transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" /> Redo
          </button>
        </div>
        {nameInput}
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={initCanvas}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-24 rounded-lg border border-dashed border-slate-300 bg-white touch-none cursor-crosshair"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-slate-600">Sign above · saves automatically</p>
        <button
          onClick={clear}
          disabled={!hasInk}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-show-border text-slate-500 hover:text-slate-300 text-xs transition-colors disabled:opacity-40"
        >
          <Eraser className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
      {nameInput}
    </div>
  );
}
