// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { InstallRoute } from './install';

let route: InstallRoute = 'none';
const promptInstall = vi.fn(() => Promise.resolve(true));
vi.mock('./install', async (orig) => ({
  ...(await orig<typeof import('./install')>()),
  useInstall: () => ({ route, promptInstall }),
}));

import { InstallCard } from './InstallCard';

// jsdom has no <dialog> methods.
HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('InstallCard', () => {
  it("offers the icon colour first, then opens the browser's own install dialog", async () => {
    route = 'prompt';
    render(<InstallCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Install Storyshelf' }));
    expect(promptInstall).not.toHaveBeenCalled();
    const picker = screen.getByRole('group', { name: 'Pick a colour for the book' });
    expect(within(picker).getAllByRole('radio').length).toBeGreaterThanOrEqual(16);
    expect(within(picker).getByRole('radio', { name: 'Paper' })).toBeChecked();

    await userEvent.click(within(picker).getByRole('radio', { name: 'Amber' }));
    expect(within(picker).getByRole('radio', { name: 'Amber' })).toBeChecked();
    expect(screen.queryByText('Amber')).not.toBeInTheDocument(); // named for screen readers only
    expect(localStorage.getItem('storyshelf.bookColour')).toBe('amber');

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('walks an iPhone through choosing the icon, then Share, then Add to Home Screen', async () => {
    route = 'ios';
    render(<InstallCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([
      "Tap  Share in the browser's toolbar.",
      'Scroll down and tap  Add to Home Screen.',
      'Tap Add.',
    ]);
    expect(screen.getByText(/sign in once more there/)).toBeInTheDocument();
  });

  it("names Mac Safari's menu, and lets the icon be chosen first", async () => {
    route = 'mac-safari';
    render(<InstallCard />);
    expect(screen.getByText('File › Add to Dock')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose the icon' }));
    expect(screen.getByRole('group', { name: 'Pick a colour for the book' })).toBeInTheDocument();
  });

  it('is not there when installed, or when the browser cannot install', () => {
    for (const r of ['installed', 'none'] as const) {
      route = r;
      const { container } = render(<InstallCard />);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });
});
