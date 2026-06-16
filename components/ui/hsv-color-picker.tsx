"use client";

import { useRef, useEffect } from "react";

export type ColorPreset = { label: string; value: string };

export const BUBBLE_COLOR_PRESETS: ColorPreset[] = [
  { label: "Bleu",    value: "#1d4ed8" },
  { label: "Indigo",  value: "#4338ca" },
  { label: "Violet",  value: "#7c3aed" },
  { label: "Rose",    value: "#be185d" },
  { label: "Rouge",   value: "#b91c1c" },
  { label: "Ambre",   value: "#b45309" },
  { label: "Vert",    value: "#047857" },
  { label: "Cyan",    value: "#0e7490" },
  { label: "Ardoise", value: "#475569" },
  { label: "Zinc",    value: "#3f3f46" },
];

export const ACCENT_COLOR_PRESETS: ColorPreset[] = [
  { label: "Gris",   value: "#9aa0a6" },
  { label: "Rouge",  value: "#F56868" },
  { label: "Orange", value: "#FF8C42" },
  { label: "Jaune",  value: "#F1DF38" },
  { label: "Vert",   value: "#8AE06C" },
  { label: "Teal",   value: "#2DD4BF" },
  { label: "Bleu",   value: "#60A5FA" },
  { label: "Violet", value: "#A77DFF" },
  { label: "Rose",   value: "#FF6B9D" },
  { label: "Ambre",  value: "#f59e0b" },
];

export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max, s = max === 0 ? 0 : d / max;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(hh * 360), s, v };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  return "#" + [r + m, g + m, b + m].map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("");
}

export function HsvColorPicker({
  color,
  onChange,
  presets = BUBBLE_COLOR_PRESETS,
}: {
  color: string;
  onChange: (hex: string) => void;
  presets?: ColorPreset[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hsv = hexToHsv(color) ?? { h: 220, s: 0.85, v: 0.85 };
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 220;
    const H = canvas.offsetHeight || 150;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = `hsl(${hsv.h},100%,50%)`;
    ctx.fillRect(0, 0, W, H);
    const wg = ctx.createLinearGradient(0, 0, W, 0);
    wg.addColorStop(0, "rgba(255,255,255,1)");
    wg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const px = hsv.s * W, py = (1 - hsv.v) * H;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h, hsv.s, hsv.v]);

  function pickSV(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onChangeRef.current(hsvToHex(hsvRef.current.h, s, v));
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-[6px] cursor-crosshair"
        style={{ height: 150 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickSV(e); }}
        onPointerMove={(e) => { if (e.buttons > 0) pickSV(e); }}
      />

      {/* Slider teinte */}
      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
      >
        <input
          type="range" min="0" max="360" value={hsv.h}
          onChange={(e) => onChangeRef.current(hsvToHex(parseInt(e.target.value), hsvRef.current.s, hsvRef.current.v))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
          style={{ left: `calc(${(hsv.h / 360) * 100}% - 6px)`, backgroundColor: `hsl(${hsv.h},100%,50%)` }}
        />
      </div>

      {/* Couleurs prédéfinies */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {presets.map((c) => (
            <button
              key={c.value} type="button" title={c.label}
              onClick={() => onChangeRef.current(c.value)}
              className="h-4 w-4 rounded-sm border border-border/40 hover:ring-2 hover:ring-ring transition-shadow"
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
