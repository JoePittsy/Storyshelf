import { resetBackStack } from '../lib/backStack';

/** Lets the History API's asynchronous traversals (and the popstate each fires) finish. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 30));

/** A page two routes deep, as a router would leave it, and the back stack forgotten. Call in beforeEach. */
export async function freshHistory(): Promise<void> {
  resetBackStack();
  history.replaceState({ key: 'a', idx: 0 }, '', '/a');
  history.pushState({ key: 'b', idx: 1 }, '', '/b');
  await settle();
}

/** The popstates a router would hear: every one that reaches a bubble-phase listener, as the path it landed on. */
export function routerHears(): { heard: string[]; stop: () => void } {
  const heard: string[] = [];
  const on = () => heard.push(location.pathname);
  window.addEventListener('popstate', on);
  return { heard, stop: () => window.removeEventListener('popstate', on) };
}

/** jsdom has no popover: lets a test open and close one the way the browser does, with `toggle` events. */
export function fakePopover(el: HTMLElement): { show: () => void; hide: () => void } {
  const toggle = (newState: 'open' | 'closed') =>
    el.dispatchEvent(
      Object.assign(new Event('toggle'), { newState, oldState: newState === 'open' ? 'closed' : 'open' })
    );
  let open = false;
  const hide = () => {
    if (!open) return;
    open = false;
    toggle('closed');
  };
  el.hidePopover = hide;
  return {
    show: () => {
      open = true;
      toggle('open');
    },
    hide,
  };
}
