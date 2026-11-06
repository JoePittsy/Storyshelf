// STUB: tests-first. Behaviour is specified by timeline.test.ts. Do not edit the tests.
export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  contentUrl: string;
  mimeType: string;
}

export function totalDuration(_tracks: AudioTrack[]): number {
  throw new Error('not implemented');
}

/** Which track plays book time t, and where in it. Clamps t to [0,total]. At an exact boundary, use the later track. t >= total → last track at its end. */
export function locate(_tracks: AudioTrack[], _t: number): { track: AudioTrack; offset: number } {
  throw new Error('not implemented');
}

/** Book time for a position inside a track. */
export function toBookTime(_track: AudioTrack, _offset: number): number {
  throw new Error('not implemented');
}

/** Clamp a seek target (e.g. currentTime ± skip) to [0,total]. */
export function clampSeek(_t: number, _total: number): number {
  throw new Error('not implemented');
}
