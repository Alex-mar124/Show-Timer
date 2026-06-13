import { useRef, useState, useCallback } from 'react';
import { Eraser, Check } from 'lucide-react';

interface Props {
  value: string | null;                 // existing signature data URL
  onChange: (dataUrl: string | null) => void;
}

/**
 * Lightweight canvas signature pad. Captures pointer strokes and exports a
 * PNG data URL. Re-displays a saved signature as an image.
 *
 * The canvas is sized + its context configured in a ref callback so it is
 * (re)initialised every time the canvas element mounts — including after a
 * clear/redo, which previously left the remounted canvas un-sized and inert.
 */
export default function SignaturePad({ value, onChange }: Props) {
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
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#e2e8f0';
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
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  function save() {
    if (!dirty.current || !canvasRef.current) return;
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function redo() {
    // Reset internal state, then drop the stored signature to show a fresh pad.
    drawing.current = false;
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  // If a signature already exists, show it instead of the live pad.
  if (value) {
    return (
      <div className="rounded-lg border border-show-border bg-white p-2 flex items-center justify-between gap-3">
        <img src={value} alt="Client signature" className="h-16 object-contain" />
        <button
          onClick={redo}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-show-border text-slate-500 hover:text-red-400 text-xs transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" /> Redo
        </button>
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
        className="w-full h-24 rounded-lg border border-dashed border-show-border bg-show-surface touch-none cursor-crosshair"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-slate-600">Sign above</p>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            disabled={!hasInk}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-show-border text-slate-500 hover:text-slate-300 text-xs transition-colors disabled:opacity-40"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
          <button
            onClick={save}
            disabled={!hasInk}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-show-base text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" /> Save Signature
          </button>
        </div>
      </div>
    </div>
  );
}
