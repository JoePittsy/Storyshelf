/**
 * Time left as "m:ss", or "h:mm:ss" from an hour up (a 60 minute timer starts at "1:00:00"). Rounds up, so a
 * countdown only reads 0:00 when it is done. Negative and non-finite values read 0:00.
 */
export function fmtRemaining(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  const sec = String(s % 60).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}:${sec}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${sec}`;
}
