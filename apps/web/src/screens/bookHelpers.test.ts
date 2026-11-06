// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { BookItem } from '../api/items';
import {
  bookDetails,
  bookProgress,
  descriptionSource,
  currentChapterIndex,
  fmtClock,
  fmtLong,
  fmtSize,
  playFrom,
  playLabel,
  sanitiseDescription,
  summariseList,
} from './bookHelpers';

const chapters = [
  { id: 0, start: 10, end: 100, title: 'One' },
  { id: 1, start: 100, end: 200, title: 'Two' },
];

describe('REQ-13 time formatting', () => {
  it('formats time left as Xh Ym or Ym', () => {
    expect(fmtLong(4 * 3600 + 12 * 60 + 30)).toBe('4h 12m');
    expect(fmtLong(59 * 60 + 59)).toBe('59m');
    expect(fmtLong(3600)).toBe('1h 0m');
    expect(fmtLong(-5)).toBe('0m');
  });
  it('formats clock times', () => {
    expect(fmtClock(3730)).toBe('1:02:10');
    expect(fmtClock(65, false)).toBe('1:05');
    expect(fmtClock(65)).toBe('0:01:05');
  });
});

describe('REQ-15 current chapter', () => {
  it('is the chapter containing the time', () => expect(currentChapterIndex(chapters, 150)).toBe(1));
  it('switches exactly at a chapter start', () => {
    expect(currentChapterIndex(chapters, 100)).toBe(1);
    expect(currentChapterIndex(chapters, 99.9)).toBe(0);
  });
  it('is -1 before the first chapter', () => expect(currentChapterIndex(chapters, 5)).toBe(-1));
  it('is -1 at or after the end', () => {
    expect(currentChapterIndex(chapters, 200)).toBe(-1);
    expect(currentChapterIndex(chapters, 999)).toBe(-1);
  });
  it('is -1 with no chapters', () => expect(currentChapterIndex([], 5)).toBe(-1));
});

describe('REQ-14 button label', () => {
  it('Play when not started', () => {
    expect(playLabel(undefined)).toBe('Play');
    expect(playLabel(null)).toBe('Play');
    expect(playLabel({ currentTime: 0, isFinished: false })).toBe('Play');
  });
  it('Resume at 1:02:10', () => {
    const p = { currentTime: 3730, isFinished: false };
    expect(playLabel(p)).toBe('Resume');
    expect(playFrom(p)).toBe(3730);
  });
  it('Play again when finished, from the start', () => {
    const p = { currentTime: 9999, isFinished: true };
    expect(playLabel(p)).toBe('Play again');
    expect(playFrom(p)).toBe(0);
  });
});

describe('description sanitising', () => {
  it('strips script and event handlers but keeps formatting', () => {
    const out = sanitiseDescription('<p>Hi <b>there</b></p><script>alert(1)</script><img src=x onerror="alert(2)">');
    expect(out).not.toMatch(/script|onerror|alert/);
    expect(out).toContain('<b>there</b>');
  });
});

describe('description links', () => {
  const links = (html: string) =>
    [...new DOMParser().parseFromString(sanitiseDescription(html), 'text/html').querySelectorAll('a')];

  it('links a bare http(s) URL, opening in a new tab without leaking the opener', () => {
    const [a] = links('<p>Read more at https://en.wikipedia.org/wiki/Peter_Rabbit for the history.</p>');
    expect(a?.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Peter_Rabbit');
    expect(a?.textContent).toBe('https://en.wikipedia.org/wiki/Peter_Rabbit');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('keeps the surrounding text and links several URLs', () => {
    const out = sanitiseDescription('See http://a.example/x and https://b.example/y.');
    expect(out).toBe(
      'See <a href="http://a.example/x" rel="noopener noreferrer" target="_blank">http://a.example/x</a> and ' +
        '<a href="https://b.example/y" rel="noopener noreferrer" target="_blank">https://b.example/y</a>.',
    );
  });
  it('leaves trailing punctuation, and an unmatched closing bracket, outside the link', () => {
    expect(links('(see https://a.example/x), then https://b.example/y!')
      .map((a) => a.getAttribute('href'))).toEqual(['https://a.example/x', 'https://b.example/y']);
    expect(links('https://a.example/Foo_(bar)')[0]?.getAttribute('href')).toBe('https://a.example/Foo_(bar)');
  });
  it('leaves existing anchors alone, including their text and attributes', () => {
    const html = '<a href="https://a.example/">https://a.example/</a> and <a href="https://b.example/">click https://c.example</a>';
    const found = links(html);
    expect(found.map((a) => a.getAttribute('href'))).toEqual(['https://a.example/', 'https://b.example/']);
    expect(found[1]?.textContent).toBe('click https://c.example');
    expect(found.every((a) => a.getAttribute('target') === null)).toBe(true);
  });
  it('never produces a javascript: link, and does not link other schemes', () => {
    const out = sanitiseDescription(
      'javascript:alert(1) data:text/html,x <a href="javascript:alert(2)">x</a> ftp://a.example http://javascript:alert(3)',
    );
    const hrefs = links(out).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /^\s*javascript:/i.test(h))).toBe(false);
    expect(out).not.toMatch(/href="(?!https?:)/);
  });
  it('escapes markup in the text around a link', () => {
    expect(sanitiseDescription('1 &lt; 2 at https://a.example/')).toContain('1 &lt; 2 at <a ');
  });
});

describe('REQ-13 book details', () => {
  const book = (over: Partial<BookItem['media']['metadata']> = {}, size?: number): BookItem => ({
    id: 'b',
    updatedAt: 1,
    size,
    media: {
      metadata: {
        title: 'T',
        subtitle: null,
        authors: [],
        narrators: [],
        series: [],
        description: null,
        publishedYear: null,
        ...over,
      },
      duration: 41280,
      chapters: [],
    },
  });

  it('formats sizes in decimal units', () => {
    expect(fmtSize(656_400_000)).toBe('656.4 MB');
    expect(fmtSize(1_500_000_000)).toBe('1.5 GB');
    expect(fmtSize(512)).toBe('512 B');
  });

  it('shows only the fields that are present', () => {
    expect(bookDetails(book())).toEqual([{ label: 'Duration', value: '11h 28m' }]);
  });

  it('lists everything ABS does, in its order', () => {
    const rows = bookDetails(
      book(
        {
          narrators: ['A', 'B'],
          series: [{ id: 's', name: 'Saga', sequence: '2' }],
          publishedYear: '2021',
          publisher: 'Pub',
          genres: ['Fantasy', 'Mystery'],
          language: 'English',
        },
        656_400_000
      )
    );
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      'Narrators: A, B',
      'Series: Saga #2',
      'Published: 2021',
      'Publisher: Pub',
      'Genres: Fantasy, Mystery',
      'Language: English',
      'Duration: 11h 28m',
      'Size: 656.4 MB',
    ]);
  });

  it('truncates long lists with a count', () => {
    expect(summariseList(['a', 'b'], 3)).toBe('a, b');
    expect(summariseList(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toBe('a, b, c and 4 more');
  });
});

describe('bookProgress', () => {
  const book = {
    id: 'li_1',
    updatedAt: 1,
    media: {
      metadata: {} as never,
      duration: 1000,
      chapters: [
        { id: 0, start: 0, end: 500, title: 'One' },
        { id: 1, start: 500, end: 1000, title: 'Two' },
      ],
    },
    userMediaProgress: { currentTime: 100, progress: 0.1, isFinished: false },
  };
  const idle = { item: null, position: 0, duration: 0, chapterIndex: -1 };

  it('uses the fetched progress when the book is not the one playing', () => {
    expect(bookProgress(book, idle)).toMatchObject({ currentTime: 100, progress: 0.1, chapterIndex: 0, live: false });
    expect(bookProgress(book, { item: { id: 'other' }, position: 900, duration: 2000, chapterIndex: 1 }).live).toBe(false);
  });

  it('uses the player for the book that is loaded, however stale the fetch', () => {
    const r = bookProgress(book, { item: { id: 'li_1' }, position: 750, duration: 1000, chapterIndex: 1 });
    expect(r).toMatchObject({ currentTime: 750, progress: 0.75, chapterIndex: 1, isFinished: false, live: true });
  });

  it('starts from nothing when there is no fetched progress', () => {
    expect(bookProgress({ ...book, userMediaProgress: null }, idle)).toMatchObject({ currentTime: 0, chapterIndex: -1 });
  });

  it('reads as finished within a second of the end', () => {
    expect(bookProgress(book, { item: { id: 'li_1' }, position: 999.5, duration: 1000, chapterIndex: 1 }).isFinished).toBe(true);
  });
});

describe('descriptionSource', () => {
  it('names the site when the description is only a link', () => {
    expect(descriptionSource('https://www.archive.org/details/peter_rabbit')).toEqual({
      href: 'https://www.archive.org/details/peter_rabbit',
      host: 'archive.org',
    });
    expect(descriptionSource('<p> http://librivox.org/x </p>')?.host).toBe('librivox.org');
  });
  it('is null for prose, or a link with words around it', () => {
    expect(descriptionSource('A tale. See https://archive.org')).toBeNull();
    expect(descriptionSource('<p>Plain text</p>')).toBeNull();
    expect(descriptionSource('')).toBeNull();
  });
});
