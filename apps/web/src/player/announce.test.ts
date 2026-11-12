import { describe, expect, it } from 'vitest';
import { playerAnnouncement, type Heard } from './announce';

const book = { id: 'b1', title: 'Peter Rabbit', author: 'Beatrix Potter', coverUrl: '' };
const other = { ...book, id: 'b2', title: 'The Hobbit' };
const state = (over: Partial<Heard> = {}): Heard => ({
  status: 'paused',
  item: book,
  rate: 1,
  sleep: null,
  position: 100,
  ended: false,
  ...over,
});

describe('playerAnnouncement: playing and paused', () => {
  it('names a book that starts for the first time', () => {
    expect(playerAnnouncement(state(), state({ status: 'playing' }), null)).toBe('Playing Peter Rabbit');
    expect(playerAnnouncement(state({ status: 'idle', item: null }), state({ status: 'playing' }), 'b2')).toBe(
      'Playing Peter Rabbit'
    );
  });

  it('says only "Playing" when the same book carries on', () => {
    expect(playerAnnouncement(state(), state({ status: 'playing' }), 'b1')).toBe('Playing');
  });

  it('says "Paused" when playing stops, but not at the end of the book', () => {
    expect(playerAnnouncement(state({ status: 'playing' }), state(), 'b1')).toBe('Paused');
    expect(playerAnnouncement(state({ status: 'playing' }), state({ ended: true }), 'b1')).toBeNull();
  });

  it('says nothing while loading, or for a pause that was already paused', () => {
    expect(playerAnnouncement(state(), state({ status: 'loading' }), null)).toBeNull();
    expect(playerAnnouncement(state(), state({ position: 200 }), null)).toBeNull();
  });

  it('says nothing for playing that carries on (a position tick, a reload that passes through loading)', () => {
    const playing = state({ status: 'playing' });
    expect(playerAnnouncement(playing, state({ status: 'playing', position: 101 }), 'b1')).toBeNull();
    expect(playerAnnouncement(playing, state({ status: 'loading' }), 'b1')).toBeNull();
  });
});

describe('playerAnnouncement: speed', () => {
  it('says the new speed when the listener changes it on the same book', () => {
    expect(playerAnnouncement(state(), state({ rate: 1.25 }), 'b1')).toBe('Speed 1.3×');
    expect(playerAnnouncement(state({ rate: 1.25 }), state({ rate: 1.5 }), 'b1')).toBe('Speed 1.5×');
    expect(playerAnnouncement(state({ rate: 1.5 }), state({ rate: 1 }), 'b1')).toBe('Speed 1.0×');
  });

  it('does not say it when another book arrives with its own speed', () => {
    expect(playerAnnouncement(state(), state({ item: other, rate: 1.4 }), 'b1')).toBeNull();
    expect(playerAnnouncement(state({ item: null }), state({ rate: 1.4 }), null)).toBeNull();
  });
});

describe('playerAnnouncement: sleep timer', () => {
  const minutes = (m: number, remainingMs = m * 60_000) => ({ kind: 'minutes' as const, remainingMs, minutes: m });
  const chapter = { kind: 'chapter' as const, endsAt: 900 };

  it('says what was set', () => {
    expect(playerAnnouncement(state(), state({ sleep: minutes(15) }), 'b1')).toBe('Sleep timer: 15 minutes');
    expect(playerAnnouncement(state(), state({ sleep: minutes(1) }), 'b1')).toBe('Sleep timer: 1 minute');
    expect(playerAnnouncement(state(), state({ sleep: chapter }), 'b1')).toBe('Sleep timer: end of chapter');
  });

  it('says a change of length or kind', () => {
    expect(playerAnnouncement(state({ sleep: minutes(15) }), state({ sleep: minutes(30) }), 'b1')).toBe(
      'Sleep timer: 30 minutes'
    );
    expect(playerAnnouncement(state({ sleep: minutes(15) }), state({ sleep: chapter }), 'b1')).toBe(
      'Sleep timer: end of chapter'
    );
  });

  it('says the same length chosen again, which starts it over', () => {
    expect(playerAnnouncement(state({ sleep: minutes(15, 300_000) }), state({ sleep: minutes(15) }), 'b1')).toBe(
      'Sleep timer: 15 minutes'
    );
  });

  it('says nothing as a minutes timer counts down', () => {
    expect(
      playerAnnouncement(state({ sleep: minutes(15, 600_000) }), state({ sleep: minutes(15, 599_000) }), 'b1')
    ).toBeNull();
  });

  it('says when it is turned off', () => {
    expect(playerAnnouncement(state({ sleep: minutes(15, 600_000) }), state(), 'b1')).toBe('Sleep timer off');
    expect(playerAnnouncement(state({ sleep: chapter, position: 100 }), state(), 'b1')).toBe('Sleep timer off');
  });

  it('says nothing when it simply runs out', () => {
    expect(
      playerAnnouncement(state({ status: 'playing', sleep: minutes(15, 300) }), state({ status: 'playing' }), 'b1')
    ).toBeNull();
    expect(
      playerAnnouncement(
        state({ status: 'playing', sleep: chapter, position: 899.6 }),
        state({ status: 'playing' }),
        'b1'
      )
    ).toBeNull();
  });

  it('says nothing for a timer that goes with its book', () => {
    expect(playerAnnouncement(state({ sleep: minutes(15, 600_000) }), state({ item: null }), 'b1')).toBeNull();
  });
});
