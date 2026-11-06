/**
 * Tests for the global book timeline (many audio files treated as one clock).
 * Code under test: apps/web/src/player/timeline.ts
 *
 * Requirements covered (IDs appear in the test names):
 *  REQ-17 Skip back/forward, 30 s by default, clamped to the book.
 *  REQ-21 Books made of many audio files play straight through.
 *
 * Design facts (ABS v2.37.2): every time is seconds of the WHOLE book. Each audio
 * track has `startOffset` (book time at which it begins) and `duration`.
 * `locate` at an exact boundary picks the later track; t >= total gives the last
 * track at its end; t is clamped to [0, total].
 */
import { describe, expect, it } from 'vitest';
import { clampSeek, locate, toBookTime, totalDuration, type AudioTrack } from './timeline';

/** Builds consecutive tracks whose startOffsets are the running total of the durations. */
function tracksOf(durations: number[]): AudioTrack[] {
  let offset = 0;
  return durations.map((duration, i) => {
    const track: AudioTrack = {
      index: i + 1,
      startOffset: offset,
      duration,
      contentUrl: `/api/items/li_1/file/${i + 1}`,
      mimeType: 'audio/mpeg',
    };
    offset += duration;
    return track;
  });
}

/** Indexed access that fails loudly instead of using a non-null assertion. */
function at(tracks: AudioTrack[], i: number): AudioTrack {
  const t = tracks[i];
  if (!t) throw new Error(`Test fixture has no track at position ${i}`);
  return t;
}

const THREE = tracksOf([100, 150, 50]); // A 0-100, B 100-250, C 250-300; total 300
const SINGLE = tracksOf([3600]);

describe('REQ-21: totalDuration', () => {
  it('REQ-21: sums the durations of all tracks', () => {
    expect(totalDuration(THREE), 'Expected 100 + 150 + 50 = 300 s for the three-file book').toBe(300);
  });

  it('REQ-21: a single-file book has the length of that file', () => {
    expect(totalDuration(SINGLE), 'Expected a one-file book to last as long as its only file').toBe(3600);
  });

  it('REQ-21: a book with no tracks lasts 0 s', () => {
    expect(totalDuration([]), 'Expected an empty track list to total 0 s').toBe(0);
  });
});

describe('REQ-21: locate maps book time to a track and an offset in it', () => {
  it('REQ-21: time 0 is the start of the first track', () => {
    const { track, offset } = locate(THREE, 0);
    expect(track.index, 'Expected book time 0 to play track 1').toBe(1);
    expect(offset, 'Expected to start at the beginning of track 1').toBe(0);
  });

  it('REQ-21: time inside the first track gives that offset in the first track', () => {
    const { track, offset } = locate(THREE, 99.5);
    expect(track.index, 'Expected 99.5 s to still be in track 1').toBe(1);
    expect(offset, 'Expected the offset to equal the book time inside track 1').toBe(99.5);
  });

  it('REQ-21: time in a middle track gives the offset relative to that track start', () => {
    const { track, offset } = locate(THREE, 175);
    expect(track.index, 'Expected 175 s to be in track 2 (100-250)').toBe(2);
    expect(offset, 'Expected 175 - 100 = 75 s into track 2').toBe(75);
  });

  it('REQ-21: an exact boundary between files selects the later track at offset 0', () => {
    const { track, offset } = locate(THREE, 100);
    expect(track.index, 'Expected the boundary at 100 s to belong to track 2, not track 1').toBe(2);
    expect(offset, 'Expected offset 0 at the boundary').toBe(0);
  });

  it('REQ-21: the second boundary also selects the later track', () => {
    const { track, offset } = locate(THREE, 250);
    expect(track.index, 'Expected the boundary at 250 s to belong to track 3').toBe(3);
    expect(offset, 'Expected offset 0 at the boundary').toBe(0);
  });

  it('REQ-21: a hair before a boundary is still the earlier track, near its end', () => {
    const { track, offset } = locate(THREE, 99.999);
    expect(track.index, 'Expected 99.999 s to be in track 1').toBe(1);
    expect(offset, 'Expected to be almost at the end of track 1').toBeCloseTo(99.999, 9);
  });

  it('REQ-21: time equal to the total is the last track at its end', () => {
    const { track, offset } = locate(THREE, 300);
    expect(track.index, 'Expected t == total to resolve to the last track').toBe(3);
    expect(offset, 'Expected the end of the last track (its duration)').toBe(50);
  });

  it('REQ-21: time beyond the total is clamped to the last track at its end', () => {
    const { track, offset } = locate(THREE, 9999);
    expect(track.index, 'Expected t > total to resolve to the last track').toBe(3);
    expect(offset, 'Expected t > total to be clamped to the end of the last track').toBe(50);
  });

  it('REQ-21: negative time is clamped to the start of the first track', () => {
    const { track, offset } = locate(THREE, -5);
    expect(track.index, 'Expected t < 0 to resolve to the first track').toBe(1);
    expect(offset, 'Expected t < 0 to be clamped to offset 0').toBe(0);
  });

  it('REQ-21: a single-file book maps book time straight to the file offset', () => {
    const { track, offset } = locate(SINGLE, 1234.5);
    expect(track.index, 'Expected the only track to be used').toBe(1);
    expect(offset, 'Expected the file offset to equal the book time').toBe(1234.5);
  });

  it('REQ-21: a single-file book at its exact end is the end of that file', () => {
    const { track, offset } = locate(SINGLE, 3600);
    expect(track.index, 'Expected the only track to be used').toBe(1);
    expect(offset, 'Expected the end of the file').toBe(3600);
  });

  it('REQ-21: moving from file 3 to file 4 of a 40-file book is one step across the boundary', () => {
    const forty = tracksOf(Array.from({ length: 40 }, () => 600));
    const before = locate(forty, 1799.999); // end of file 3 (index 3 is 1200-1800)
    const after = locate(forty, 1800); // start of file 4
    expect(before.track.index, 'Expected 1799.999 s to be the end of file 3').toBe(3);
    expect(after.track.index, 'Expected 1800 s to be the start of file 4').toBe(4);
    expect(after.offset, 'Expected file 4 to start at offset 0 so playback continues without a gap').toBe(0);
  });

  it('REQ-21: fractional durations (as real MP3s have) still resolve boundaries to the later track', () => {
    const tracks = tracksOf([1234.567, 987.654, 456.789]);
    const boundary = at(tracks, 1).startOffset;
    expect(locate(tracks, boundary).track.index, 'Expected the exact boundary to select track 2').toBe(2);
    expect(locate(tracks, boundary).offset, 'Expected offset 0 at the exact boundary').toBe(0);
  });
});

describe('REQ-21: toBookTime converts a position in a track back to book time', () => {
  it('REQ-21: adds the track startOffset to the offset', () => {
    expect(toBookTime(at(THREE, 1), 75), 'Expected 100 + 75 = 175 s of book time').toBe(175);
  });

  it('REQ-21: offset 0 in a track is the track startOffset', () => {
    expect(toBookTime(at(THREE, 2), 0), 'Expected the start of track 3 to be 250 s of book time').toBe(250);
  });

  it('REQ-21: round-trips with locate across every boundary and a spread of times', () => {
    for (const t of [0, 1, 99.5, 100, 175, 249.999, 250, 299, 300]) {
      const { track, offset } = locate(THREE, t);
      expect(toBookTime(track, offset), `Expected locate then toBookTime to return ${t}`).toBeCloseTo(t, 9);
    }
  });

  it('REQ-21: round-trips with locate for a 40-file book', () => {
    const forty = tracksOf(Array.from({ length: 40 }, (_, i) => 500 + i * 7.25));
    const total = totalDuration(forty);
    for (const t of [0, 499.99, 500, 12345.678, total - 0.001, total]) {
      const { track, offset } = locate(forty, t);
      expect(toBookTime(track, offset), `Expected the round trip to return ${t}`).toBeCloseTo(t, 6);
    }
  });

  it('REQ-21: out-of-range times round-trip to the clamped value', () => {
    const below = locate(THREE, -5);
    const above = locate(THREE, 400);
    expect(toBookTime(below.track, below.offset), 'Expected t < 0 to round-trip to 0').toBe(0);
    expect(toBookTime(above.track, above.offset), 'Expected t > total to round-trip to the total').toBe(300);
  });
});

describe('REQ-17: clampSeek keeps skip targets inside the book', () => {
  it('REQ-17: skipping back 30 s from 0:10 lands on 0:00', () => {
    expect(clampSeek(10 - 30, 3600), 'Expected a skip back past the start to stop at 0').toBe(0);
  });

  it('REQ-17: skipping forward 30 s near the end lands on the end of the book', () => {
    expect(clampSeek(3590 + 30, 3600), 'Expected a skip forward past the end to stop at the total').toBe(3600);
  });

  it('REQ-17: a target inside the book is unchanged', () => {
    expect(clampSeek(1000 + 30, 3600), 'Expected an in-range skip to be left alone').toBe(1030);
  });

  it('REQ-17: exactly 0 and exactly the total are allowed', () => {
    expect(clampSeek(0, 3600), 'Expected 0 to be a valid target').toBe(0);
    expect(clampSeek(3600, 3600), 'Expected the total to be a valid target').toBe(3600);
  });

  it('REQ-17: a zero-length book always clamps to 0', () => {
    expect(clampSeek(30, 0), 'Expected any target in a 0 s book to clamp to 0').toBe(0);
    expect(clampSeek(-30, 0), 'Expected any negative target in a 0 s book to clamp to 0').toBe(0);
  });
});
