import { describe, it, expect } from 'vitest';
import { appKeyAction, playerKeyAction } from './shortcuts';

const on = (tagName: string, role?: string, isContentEditable = false) =>
  ({
    tagName,
    isContentEditable,
    getAttribute: (n: string) => (n === 'role' ? (role ?? null) : null),
  }) as unknown as EventTarget;

describe('playerKeyAction', () => {
  it('maps the keys on a neutral target', () => {
    const body = on('BODY');
    expect(playerKeyAction({ key: ' ', target: body })).toBe('toggle');
    expect(playerKeyAction({ key: 'ArrowLeft', target: body })).toBe('back');
    expect(playerKeyAction({ key: 'ArrowRight', target: body })).toBe('forward');
    expect(playerKeyAction({ key: '[', target: body })).toBe('previousChapter');
    expect(playerKeyAction({ key: ']', target: body })).toBe('nextChapter');
    expect(playerKeyAction({ key: 'a', target: body })).toBeNull();
  });

  it('works with no target', () => {
    expect(playerKeyAction({ key: ' ' })).toBe('toggle');
  });

  it('ignores keys typed into fields', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(playerKeyAction({ key: ' ', target: on(tag) })).toBeNull();
      expect(playerKeyAction({ key: '[', target: on(tag) })).toBeNull();
    }
    expect(playerKeyAction({ key: 'ArrowLeft', target: on('DIV', undefined, true) })).toBeNull();
  });

  it('leaves Space to a focused button or link, but still takes the chapter keys', () => {
    expect(playerKeyAction({ key: ' ', target: on('BUTTON') })).toBeNull();
    expect(playerKeyAction({ key: ' ', target: on('A') })).toBeNull();
    expect(playerKeyAction({ key: ']', target: on('BUTTON') })).toBe('nextChapter');
    expect(playerKeyAction({ key: 'ArrowRight', target: on('BUTTON') })).toBe('forward');
  });

  it('leaves keys to any native control that uses them (sliders, tabs, radios, switches, buttons by role)', () => {
    for (const role of ['tab', 'tablist', 'radiogroup', 'listbox', 'combobox', 'spinbutton', 'switch']) {
      expect(playerKeyAction({ key: 'ArrowLeft', target: on('DIV', role) })).toBeNull();
      expect(playerKeyAction({ key: ' ', target: on('DIV', role) })).toBeNull();
    }
    expect(playerKeyAction({ key: ' ', target: on('DIV', 'button') })).toBeNull();
    expect(playerKeyAction({ key: ' ', target: on('SPAN', 'checkbox') })).toBeNull();
  });

  it('leaves the arrows to the seek bar and the mode switch', () => {
    expect(playerKeyAction({ key: 'ArrowLeft', target: on('DIV', 'slider') })).toBeNull();
    expect(playerKeyAction({ key: 'ArrowRight', target: on('BUTTON', 'radio') })).toBeNull();
    expect(playerKeyAction({ key: ' ', target: on('DIV', 'slider') })).toBeNull();
  });

  it('ignores chords', () => {
    const body = on('BODY');
    expect(playerKeyAction({ key: ' ', ctrlKey: true, target: body })).toBeNull();
    expect(playerKeyAction({ key: 'ArrowLeft', metaKey: true, target: body })).toBeNull();
    expect(playerKeyAction({ key: ']', altKey: true, target: body })).toBeNull();
  });
});

describe('appKeyAction', () => {
  const body = on('BODY');
  it('keeps the player keys and adds / for search and ? for the shortcuts list', () => {
    expect(appKeyAction({ key: ' ', target: body })).toBe('toggle');
    expect(appKeyAction({ key: ']', target: body })).toBe('nextChapter');
    expect(appKeyAction({ key: '/', target: body })).toBe('search');
    expect(appKeyAction({ key: '?', target: body })).toBe('help');
    expect(appKeyAction({ key: 'u', target: body })).toBeNull();
  });
  it('leaves / and ? to a field, so they can be typed', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(appKeyAction({ key: '/', target: on(tag) })).toBeNull();
      expect(appKeyAction({ key: '?', target: on(tag) })).toBeNull();
    }
    expect(appKeyAction({ key: '/', target: on('DIV', undefined, true) })).toBeNull();
  });
  it('ignores a modifier chord', () => {
    expect(appKeyAction({ key: '/', ctrlKey: true, target: body })).toBeNull();
    expect(appKeyAction({ key: '?', metaKey: true, target: body })).toBeNull();
  });
  it('maps C to car mode, in either case, but not while typing or with a modifier', () => {
    expect(appKeyAction({ key: 'c', target: body })).toBe('car');
    expect(appKeyAction({ key: 'C', target: body })).toBe('car');
    expect(appKeyAction({ key: 'c', target: on('INPUT') })).toBeNull();
    expect(appKeyAction({ key: 'c', ctrlKey: true, target: body })).toBeNull();
  });
  it('still takes / and ? from a focused button or link', () => {
    expect(appKeyAction({ key: '/', target: on('BUTTON') })).toBe('search');
    expect(appKeyAction({ key: ' ', target: on('A') })).toBeNull();
  });
});

describe('the bookmark key', () => {
  it('b (or B) bookmarks the place, but not while typing or with a modifier', () => {
    expect(playerKeyAction({ key: 'b', target: on('BODY') })).toBe('bookmark');
    expect(playerKeyAction({ key: 'B', target: on('BUTTON') })).toBe('bookmark');
    expect(appKeyAction({ key: 'b', target: on('BODY') })).toBe('bookmark');
    expect(playerKeyAction({ key: 'b', target: on('INPUT') })).toBeNull();
    expect(playerKeyAction({ key: 'b', ctrlKey: true, target: on('BODY') })).toBeNull();
  });
});
