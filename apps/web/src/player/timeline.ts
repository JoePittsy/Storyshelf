export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  contentUrl: string;
  mimeType: string;
}

export function totalDuration(tracks: AudioTrack[]): number {
  return tracks.reduce((sum, t) => sum + t.duration, 0);
}

/** Which track plays book time t, and where in it. Clamps t to [0,total]. At an exact boundary, use the later track. t >= total → last track at its end. */
export function locate(tracks: AudioTrack[], t: number): { track: AudioTrack; offset: number } {
  const last = tracks[tracks.length - 1];
  if (!last) throw new Error('Book has no audio tracks');
  if (t >= totalDuration(tracks)) return { track: last, offset: last.duration };
  const time = Math.max(0, t);
  const track = tracks.filter((x) => x.startOffset <= time).pop() ?? tracks[0] ?? last;
  return { track, offset: time - track.startOffset };
}

/** Book time for a position inside a track. */
export function toBookTime(track: AudioTrack, offset: number): number {
  return track.startOffset + offset;
}

/** Clamp a seek target (e.g. currentTime ± skip) to [0,total]. */
export function clampSeek(t: number, total: number): number {
  return Math.min(Math.max(t, 0), Math.max(total, 0));
}
