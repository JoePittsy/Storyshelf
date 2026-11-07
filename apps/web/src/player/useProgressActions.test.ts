import { describe, expect, it } from 'vitest';
import type { ProgressSnapshot } from './bookProgress';
import type { ProgressChange } from './progressActions';
import { doneMessage } from './useProgressActions';

const prev: ProgressSnapshot = {
  id: 'mp_1',
  currentTime: 711,
  duration: 36000,
  progress: 0.02,
  isFinished: false,
  finishedAt: null,
  startedAt: 10,
  lastUpdate: 20,
  hideFromContinueListening: false,
  ebookLocation: null,
  ebookProgress: null,
};
const change = (action: ProgressChange['action'], p: ProgressSnapshot | null = prev): ProgressChange => ({
  action,
  itemId: 'li_1',
  prev: p,
  held: null,
  seq: 1,
});

describe('the toast after a progress change', () => {
  it('a reset says which place was lost', () => {
    expect(doneMessage(change('reset'))).toBe('Progress reset from 11:51');
    expect(doneMessage(change('reset', { ...prev, currentTime: 3730 }))).toBe('Progress reset from 1:02:10');
  });

  it('a reset of a finished book says it was finished, not where it stood', () => {
    expect(doneMessage(change('reset', { ...prev, isFinished: true, currentTime: 36000 }))).toBe(
      'Progress reset; it was finished'
    );
  });

  it('a reset with no place to lose says only that', () => {
    expect(doneMessage(change('reset', null))).toBe('Progress reset');
    expect(doneMessage(change('reset', { ...prev, currentTime: 0 }))).toBe('Progress reset');
  });

  it('the other changes keep their words', () => {
    expect(doneMessage(change('finish'))).toBe('Marked as finished');
    expect(doneMessage(change('unfinish'))).toBe('Marked as not finished');
    expect(doneMessage(change('hide'))).toBe('Removed from Continue listening');
  });
});
