/** Milliseconds as "m:ss" (minutes are not wrapped into hours: 75 minutes is "75:00"). */
export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
