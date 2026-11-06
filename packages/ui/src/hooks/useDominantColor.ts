import { useEffect, useState } from 'react';

/**
 * The most vibrant colour in an image, as an `r, g, b` triplet (for `rgba(${color}, 0.3)` or a `--wash` property),
 * or null until it has been read. Reads the pixels through a canvas, so a cross-origin image must be served with CORS
 * headers; without them (or if it fails to load) the result stays null and the caller keeps its fallback.
 */
export function useDominantColor(src: string | null): string | null {
  // Keyed by src, so a new src reads as no colour until its image has been analysed.
  const [result, setResult] = useState<{ src: string; color: string } | null>(null);
  const color = src && result?.src === src ? result.color : null;

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 20;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); // a software canvas: reading it back is cheap
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try {
        ({ data } = ctx.getImageData(0, 0, size, size));
      } catch {
        return; // a tainted canvas (no CORS): leave the colour null
      }

      // Score every pixel
      const candidates: { r: number; g: number; b: number; score: number; sat: number; lum: number }[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255,
          g = data[i + 1] / 255,
          b = data[i + 2] / 255;
        const max = Math.max(r, g, b),
          min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (max + min) / 2;
        const score = sat * (1 - Math.abs(lum - 0.45) * 1.8);
        candidates.push({ r: data[i], g: data[i + 1], b: data[i + 2], score, sat, lum });
      }

      // Sort best-first, then pick the first truly vibrant pixel.
      // Falls back to the raw top scorer if the whole image is dark/grey.
      candidates.sort((a, b) => b.score - a.score);
      const vibrant = candidates.find((c) => c.sat > 0.2 && c.lum > 0.18 && c.lum < 0.85);
      const pick = vibrant ?? candidates[0];

      if (!cancelled) setResult({ src, color: `${pick.r}, ${pick.g}, ${pick.b}` });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
