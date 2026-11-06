/** Clamp to min..max and round to the nearest step from min, without float noise (2.0000001 becomes 2). */
export function snapSpeed(v: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(v)) return Math.min(max, Math.max(min, 1));
  const clamped = Math.min(max, Math.max(min, v));
  const decimals = (String(step).split('.')[1] ?? '').length;
  const snapped = Number((min + Math.round((clamped - min) / step) * step).toFixed(decimals));
  return Math.min(max, Math.max(min, snapped));
}

/** "1.3", "1", "0.75": at most two decimals, no trailing zeros. */
export function fmtSpeed(v: number): string {
  return String(Number(v.toFixed(2)));
}
