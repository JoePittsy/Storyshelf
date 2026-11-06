export type PlayerKeyAction = 'toggle' | 'back' | 'forward' | 'previousChapter' | 'nextChapter';

/** The slice of a keyboard event the mapping needs; a real `KeyboardEvent` satisfies it. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Controls that own the arrow keys (the seek bar, the mode switch). */
const OWNS_ARROWS = new Set(['slider', 'radio', 'radiogroup', 'listbox', 'tab', 'menu', 'menuitem']);
/** Controls that Space activates natively: toggling play as well would double up. */
const OWNS_SPACE = new Set(['BUTTON', 'A', 'SUMMARY']);

/** Maps a key press on the full player to what it should do, or null when the key is not ours to take. */
export function playerKeyAction(e: KeyInput): PlayerKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as Partial<Pick<HTMLElement, 'tagName' | 'isContentEditable' | 'getAttribute'>> | null | undefined;
  const tag = t?.tagName?.toUpperCase() ?? '';
  const role = t?.getAttribute?.('role') ?? '';
  if (TYPING.has(tag) || t?.isContentEditable) return null;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      return OWNS_SPACE.has(tag) || OWNS_ARROWS.has(role) ? null : 'toggle';
    case 'ArrowLeft':
      return OWNS_ARROWS.has(role) ? null : 'back';
    case 'ArrowRight':
      return OWNS_ARROWS.has(role) ? null : 'forward';
    case '[':
      return 'previousChapter';
    case ']':
      return 'nextChapter';
    default:
      return null;
  }
}
