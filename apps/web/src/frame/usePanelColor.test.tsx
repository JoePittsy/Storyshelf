// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let colour: string | null = null;
vi.mock('@joepittsy/ui', () => ({ useDominantColor: () => colour }));

import { usePanelColor } from './usePanelColor';

function Page({ cover }: { cover: string | null }) {
  return <p data-testid="wash">{usePanelColor(cover) ?? 'none'}</p>;
}
const root = () => document.documentElement.style;

afterEach(() => {
  cleanup();
  colour = null;
});

describe('usePanelColor', () => {
  it('hands the cover colour to the frame while mounted, and takes it back on leaving', () => {
    colour = '12, 34, 56';
    const { getByTestId, unmount } = render(<Page cover="/c.jpg" />);
    expect(getByTestId('wash')).toHaveTextContent('12, 34, 56');
    expect(root().getPropertyValue('--panel-color')).toBe('12, 34, 56');
    expect(root().getPropertyValue('--panel-on')).toBe('1');
    unmount();
    expect(root().getPropertyValue('--panel-color')).toBe('');
    expect(root().getPropertyValue('--panel-on')).toBe('');
  });

  it('leaves the frame alone until a colour is known (the navy default stays)', () => {
    render(<Page cover={null} />);
    expect(root().getPropertyValue('--panel-on')).toBe('');
  });
});
