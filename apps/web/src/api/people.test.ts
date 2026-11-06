import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router';
import { authorImageUrl, narratorPath, searchChips } from './libraries';
import {
  authorsUrl,
  bookCount,
  decodeName,
  filterByName,
  narratorItemsUrl,
  narratorsUrl,
  seriesAuthors,
  seriesUrl,
  withLibrary,
} from './people';

describe('REQ-33 list URLs', () => {
  it('asks ABS for authors by surname, all at once', () => {
    expect(authorsUrl('lib 1')).toBe('/api/libraries/lib 1/authors?sort=lastFirst');
    expect(narratorsUrl('l')).toBe('/api/libraries/l/narrators');
  });
  it('pages series A-Z', () => {
    const u = new URL(seriesUrl('l', 2), 'http://x');
    expect(u.pathname).toBe('/api/libraries/l/series');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ page: '2', limit: '48', sort: 'name', desc: '0' });
  });
  it('keeps the library on tab links', () => {
    expect(withLibrary('/authors', 'a&b')).toBe('/authors?library=a%26b');
    expect(withLibrary('/authors', undefined)).toBe('/authors');
  });
  it('pluralises counts', () => {
    expect([bookCount(0), bookCount(1), bookCount(9)]).toEqual(['0 books', '1 book', '9 books']);
  });
  it('builds an author photo URL only when they have one', () => {
    expect(authorImageUrl({ id: 'a1', imagePath: null })).toBeUndefined();
    expect(authorImageUrl({ id: 'a1', imagePath: '/x.jpg', updatedAt: 5 })).toBe(
      '/api/authors/a1/image?width=200&format=webp&ts=5',
    );
  });
});

describe('REQ-33 filter as you type', () => {
  const rows = [{ n: 'Wanamaker, Zoë' }, { n: 'Gaiman, Neil' }, { n: 'Smith & Jones' }];
  const names = (q: string) => filterByName(rows, q, (r) => r.n).map((r) => r.n);
  it('ignores case and accents', () => {
    expect(names('zoe')).toEqual(['Wanamaker, Zoë']);
    expect(names('GAIMAN')).toEqual(['Gaiman, Neil']);
    expect(names('&')).toEqual(['Smith & Jones']);
  });
  it('keeps everything for a blank query', () => {
    expect(names('  ')).toHaveLength(3);
  });
});

describe('REQ-36 narrator names round trip', () => {
  const names = ['Zoë Wanamaker', 'Smith & Jones', 'AC/DC Reader', 'Narrator #1', '100% Real?', 'Jörg Ünal 日本'];
  it.each(names)('%s survives the route', (name) => {
    const match = matchPath('/narrator/:name', narratorPath(name));
    expect(match).not.toBeNull();
    // The router decodes the param once; decodeName leaves a decoded name alone.
    expect(decodeName(match?.params.name ?? '')).toBe(name);
  });
  it('keeps a malformed escape as typed', () => {
    expect(decodeName('50%')).toBe('50%');
  });
  it('filters items by the base64 of the exact name', () => {
    const filter = new URL(narratorItemsUrl('l', 'Zoë Wanamaker'), 'http://x').searchParams.get('filter');
    const [group, enc] = (filter ?? '').split('.');
    expect(group).toBe('narrators');
    expect(Buffer.from(decodeURIComponent(enc ?? ''), 'base64').toString('utf8')).toBe('Zoë Wanamaker');
  });
});

describe('REQ-32 search chips', () => {
  const res = {
    authors: [{ id: 'au 1', name: 'Neil Gaiman', imagePath: '/p.jpg', updatedAt: 1 }],
    narrators: [{ name: 'Smith & Jones' }],
    series: [{ series: { id: 's1', name: 'The Sandman' } }],
  };
  it('lists authors, then narrators, then series, each linking to its page', () => {
    const chips = searchChips(res, 'L1');
    expect(chips.map((c) => [c.kind, c.label, c.href])).toEqual([
      ['Author', 'Neil Gaiman', '/author/au%201?library=L1'],
      ['Narrator', 'Smith & Jones', '/narrator/Smith%20%26%20Jones?library=L1'],
      ['Series', 'The Sandman', '/series/s1?library=L1'],
    ]);
    expect(chips[0]?.avatar?.imageUrl).toContain('/api/authors/au 1/image');
    expect(chips[2]?.avatar).toBeUndefined();
  });
  it('is empty when nothing matched', () => {
    expect(searchChips({ book: [] }, 'L1')).toEqual([]);
  });
});

describe('series authors', () => {
  const book = (authorName: string | null) => ({ id: 'x', updatedAt: 1, media: { metadata: { title: 't', authorName } } });
  it('lists each author once', () => {
    expect(seriesAuthors([book('A, B'), book('A'), book(null)])).toBe('A, B');
  });
});
