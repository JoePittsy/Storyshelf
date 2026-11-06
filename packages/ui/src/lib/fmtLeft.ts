/**
 * Time left in words: "2h 14m left", "38m left", "under a minute left". Whole minutes, rounded down. The one format
 * for time remaining; the clock format ("43:30") is for a playhead position and for countdowns.
 */
export function fmtLeft(ms: number): string {
  const mins = Number.isFinite(ms) ? Math.floor(Math.max(0, ms) / 60000) : 0;
  if (mins < 1) return 'under a minute left';
  return `${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`} left`;
}
