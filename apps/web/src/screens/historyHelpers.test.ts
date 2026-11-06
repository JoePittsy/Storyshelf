import { describe, expect, it } from 'vitest';
import {
  addDays,
  chapterRange,
  dayKey,
  dayLabel,
  deviceLabel,
  fmtDate,
  fmtListened,
  fmtTimeOfDay,
  groupByDay,
  heatGrid,
  heatLevel,
  periodTotals,
  topAuthors,
  topBooks,
  weekStart,
} from './historyHelpers';

const TZ = 'Europe/London';
const at = (iso: string) => Date.parse(iso);

describe('REQ-50 grouping sessions by local day', () => {
  it('puts 23:30 and 00:30 local on different days, though both are one UTC day', () => {
    const late = at('2026-06-15T22:30:00Z'); // 23:30 BST on the 15th
    const early = at('2026-06-15T23:30:00Z'); // 00:30 BST on the 16th
    expect(dayKey(late, TZ)).toBe('2026-06-15');
    expect(dayKey(early, TZ)).toBe('2026-06-16');
    const groups = groupByDay([{ t: early }, { t: late }], (s) => s.t, TZ);
    expect(groups.map((g) => g.key)).toEqual(['2026-06-16', '2026-06-15']);
  });

  it('keeps the 25-hour day on the October changeover as one group', () => {
    const sessions = [
      at('2026-10-25T23:59:00Z'), // 23:59 GMT on the 25th
      at('2026-10-25T00:30:00Z'), // 01:30 BST, just after the clocks go back
      at('2026-10-24T23:30:00Z'), // 00:30 BST on the 25th
    ];
    const groups = groupByDay(sessions, (t) => t, TZ);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '2026-10-25' });
    expect(dayKey(at('2026-10-26T00:00:00Z'), TZ)).toBe('2026-10-26');
  });

  it('keeps the 23-hour day on the March changeover as one group', () => {
    expect(dayKey(at('2026-03-28T23:30:00Z'), TZ)).toBe('2026-03-28');
    expect(dayKey(at('2026-03-29T00:30:00Z'), TZ)).toBe('2026-03-29'); // still GMT
    expect(dayKey(at('2026-03-29T22:30:00Z'), TZ)).toBe('2026-03-29'); // 23:30 BST
    expect(dayKey(at('2026-03-29T23:30:00Z'), TZ)).toBe('2026-03-30'); // 00:30 BST
  });

  it('groups only neighbours, in the order given', () => {
    expect(groupByDay([], (t: number) => t, TZ)).toEqual([]);
    const g = groupByDay([at('2026-11-05T10:00:00Z'), at('2026-11-05T08:00:00Z'), at('2026-11-04T08:00:00Z')], (t) => t, TZ);
    expect(g.map((x) => x.items.length)).toEqual([2, 1]);
  });

  it('does day arithmetic by calendar, across month, year and changeover', () => {
    expect(addDays('2026-03-30', -1)).toBe('2026-03-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('REQ-56 dates and times', () => {
  const now = at('2026-11-06T10:00:00Z');

  it('labels Today, Yesterday, then weekday day month', () => {
    expect(dayLabel('2026-11-06', now, TZ)).toBe('Today');
    expect(dayLabel('2026-11-05', now, TZ)).toBe('Yesterday');
    expect(dayLabel('2026-11-02', now, TZ)).toBe('Mon 2 Nov');
  });
  it('adds the year only when it is not this one', () => {
    expect(dayLabel('2025-12-31', now, TZ)).toBe('Wed 31 Dec 2025');
  });
  it('finds Yesterday across the March changeover', () => {
    expect(dayLabel('2026-03-29', at('2026-03-30T10:00:00Z'), TZ)).toBe('Yesterday');
  });
  it('uses the zone for Today as well as for the session', () => {
    // 23:30 UTC on the 5th is already the 6th in London in summer, so it is Today at 00:30 BST.
    const summerNow = at('2026-06-05T23:30:00Z');
    expect(dayLabel('2026-06-06', summerNow, TZ)).toBe('Today');
  });

  it('formats the time of day on a 24-hour clock', () => {
    expect(fmtTimeOfDay(at('2026-06-15T20:40:00Z'), TZ)).toBe('21:40');
    expect(fmtTimeOfDay(at('2026-06-15T23:05:00Z'), TZ)).toBe('00:05');
    expect(fmtTimeOfDay(at('2026-12-15T20:40:00Z'), TZ)).toBe('20:40');
  });

  it('formats a date, with the year when asked or when it is not this one', () => {
    const d = at('2026-10-03T12:00:00Z');
    expect(fmtDate(d, now, 'always', TZ)).toBe('3 Oct 2026');
    expect(fmtDate(d, now, 'auto', TZ)).toBe('3 Oct');
    expect(fmtDate(at('2025-12-01T12:00:00Z'), now, 'auto', TZ)).toBe('1 Dec 2025');
  });

  it('formats durations naturally', () => {
    expect(fmtListened(48 * 60)).toBe('48 min');
    expect(fmtListened(3600 + 5 * 60)).toBe('1h 05m');
    expect(fmtListened(6 * 3600 + 40 * 60)).toBe('6h 40m');
    expect(fmtListened(0)).toBe('0 min');
    expect(fmtListened(20)).toBe('<1 min');
    expect(fmtListened(3599.9)).toBe('1h 00m');
    expect(fmtListened(-4)).toBe('0 min');
  });
});

describe('REQ-50 chapter range of a session', () => {
  const chapters = [
    { id: 0, start: 0, end: 100, title: 'One' },
    { id: 1, start: 100, end: 200, title: 'Two' },
    { id: 2, start: 200, end: 300, title: 'Three' },
  ];
  it('names the start and end chapters', () => {
    expect(chapterRange(chapters, 10, 150)).toBe('Ch 1 → Ch 2');
    expect(chapterRange(chapters, 10, 250)).toBe('Ch 1 → Ch 3');
  });
  it('names one chapter when the session stayed inside it', () => {
    expect(chapterRange(chapters, 110, 190)).toBe('Ch 2');
  });
  it('counts an end exactly on a boundary in the chapter that just finished', () => {
    expect(chapterRange(chapters, 10, 100)).toBe('Ch 1');
    expect(chapterRange(chapters, 10, 200)).toBe('Ch 1 → Ch 2');
    expect(chapterRange(chapters, 10, 300)).toBe('Ch 1 → Ch 3');
  });
  it('counts a start exactly on a boundary in the chapter it begins', () => {
    expect(chapterRange(chapters, 100, 150)).toBe('Ch 2');
  });
  it('is the start chapter when nothing was played', () => {
    expect(chapterRange(chapters, 100, 100)).toBe('Ch 2');
    expect(chapterRange(chapters, 150, 120)).toBe('Ch 2');
  });
  it('clamps times past the last chapter', () => {
    expect(chapterRange(chapters, 250, 999)).toBe('Ch 3');
    expect(chapterRange(chapters, 10, 999)).toBe('Ch 1 → Ch 3');
  });
  it('falls back to a time range with no chapters', () => {
    expect(chapterRange([], 10, 3730)).toBe('0:00:10 → 1:02:10');
  });
  it('falls back to a time range with a single chapter, which says nothing', () => {
    expect(chapterRange([{ id: 0, start: 0, end: 500, title: 'All' }], 10, 70)).toBe('0:00:10 → 0:01:10');
  });
});

describe('REQ-50 device label', () => {
  it('joins hardware and app', () => {
    expect(deviceLabel({ osName: 'iOS', deviceType: 'mobile', clientName: 'Storyshelf', browserName: 'Safari' })).toBe(
      'iPhone · Storyshelf',
    );
    expect(deviceLabel({ osName: 'iOS', deviceType: 'tablet', clientName: 'Storyshelf' })).toBe('iPad · Storyshelf');
  });
  it('prefers a phone model, and names the browser for ABS web clients', () => {
    expect(deviceLabel({ model: 'Pixel 9', clientName: 'Abs Android' })).toBe('Pixel 9 · Abs Android');
    expect(deviceLabel({ osName: 'Windows', clientName: 'Abs Web', browserName: 'Chrome' })).toBe('Windows · Chrome');
  });
  it('copes with missing fields', () => {
    expect(deviceLabel(null)).toBe('');
    expect(deviceLabel(undefined)).toBe('');
    expect(deviceLabel({})).toBe('');
    expect(deviceLabel({ clientName: 'Storyshelf' })).toBe('Storyshelf');
    expect(deviceLabel({ osName: 'Linux', clientName: '' })).toBe('Linux');
    expect(deviceLabel({ osName: 'iOS', clientName: 'Storyshelf' })).toBe('iOS · Storyshelf');
  });
  it('does not repeat itself', () => {
    expect(deviceLabel({ osName: 'Storyshelf', clientName: 'Storyshelf' })).toBe('Storyshelf');
  });
});

describe('REQ-53 period totals with a Monday week', () => {
  it('starts the week on Monday', () => {
    expect(weekStart('2026-11-06')).toBe('2026-11-02'); // Friday
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday belongs to the week before the next Monday
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
  it('sums the week, month and year', () => {
    const days = { '2026-10-31': 1000, '2026-11-01': 100, '2026-11-02': 60, '2026-11-06': 40, '2025-12-31': 7 };
    expect(periodTotals(days, '2026-11-06')).toEqual({ week: 100, month: 200, year: 1200 });
  });
  it('counts a Sunday in its own week, not the next', () => {
    expect(periodTotals({ '2026-11-08': 5, '2026-11-09': 9 }, '2026-11-08').week).toBe(5);
  });
  it('lets the week cross a month, and cross a year, without the month or year following it', () => {
    const d = { '2026-11-30': 10, '2026-12-01': 20 };
    expect(periodTotals(d, '2026-12-02')).toEqual({ week: 30, month: 20, year: 30 });
    const y = { '2026-12-30': 10, '2027-01-01': 20 };
    expect(periodTotals(y, '2027-01-01')).toEqual({ week: 30, month: 20, year: 20 });
  });
  it('is zero for no listening', () => {
    expect(periodTotals({}, '2026-11-06')).toEqual({ week: 0, month: 0, year: 0 });
  });
});

describe('REQ-53 heatmap grid', () => {
  it('ends on the current week, Monday first, with future days empty', () => {
    const g = heatGrid({ '2026-11-06': 3600, '2026-11-02': 60 }, '2026-11-06', 3);
    expect(g.rows).toHaveLength(7);
    expect(g.rows[0]).toHaveLength(3);
    expect(g.rows[0]?.[2]).toEqual({ key: '2026-11-02', seconds: 60 });
    expect(g.rows[4]?.[2]).toEqual({ key: '2026-11-06', seconds: 3600 });
    expect(g.rows[5]?.[2]).toEqual({ key: '2026-11-07', seconds: null });
    expect(g.rows[6]?.[0]).toEqual({ key: '2026-10-25', seconds: 0 });
  });
  it('names a month over its first column, never the leftmost', () => {
    expect(heatGrid({}, '2026-11-06', 3).columns).toEqual(['', '', 'Nov']);
  });
  it('maps seconds onto ramp steps', () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(100, 100)).toBe(8);
    expect(heatLevel(50, 100)).toBe(5);
    expect(heatLevel(10, 0)).toBe(0);
  });
});

describe('REQ-53 top books and authors', () => {
  const items = {
    a: { id: 'a', timeListening: 600, mediaMetadata: { title: 'Mythos', authors: [{ name: 'Stephen Fry' }] } },
    b: { id: 'b', timeListening: 1800, mediaMetadata: { title: 'Heroes', authors: [{ name: 'Stephen Fry' }] } },
    c: { id: 'c', timeListening: 1200, mediaMetadata: { title: 'Good Omens', authors: [{ name: 'Terry Pratchett' }, { name: 'Neil Gaiman' }] } },
    d: { id: 'd', timeListening: 0, mediaMetadata: { title: 'Unplayed' } },
    e: { id: 'e', timeListening: 30, mediaMetadata: null },
  };
  it('ranks books by time and drops unplayed ones', () => {
    expect(topBooks(items, 3).map((b) => [b.title, b.seconds])).toEqual([
      ['Heroes', 1800],
      ['Good Omens', 1200],
      ['Mythos', 600],
    ]);
    expect(topBooks(items, 10).slice(-1)[0]).toEqual({ id: 'e', title: 'Untitled', seconds: 30 });
  });
  it('adds an author’s books together and credits every author of a joint book', () => {
    expect(topAuthors(items, 5)).toEqual([
      { name: 'Stephen Fry', seconds: 2400 },
      { name: 'Terry Pratchett', seconds: 1200 },
      { name: 'Neil Gaiman', seconds: 1200 },
    ]);
  });
  it('copes with no items', () => {
    expect(topBooks({}, 5)).toEqual([]);
    expect(topAuthors({}, 5)).toEqual([]);
  });
});
