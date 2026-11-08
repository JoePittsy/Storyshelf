// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
});

describe('InstallCard', () => {
  it("opens the browser's own install dialog where there is one", async () => {
    route = 'prompt';
    render(<InstallCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Install Storyshelf' }));
    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('walks an iPhone through Share, then Add to Home Screen', async () => {
    route = 'ios';
    render(<InstallCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([
      "Tap  Share in the browser's toolbar.",
      'Scroll down and tap  Add to Home Screen.',
      'Tap Add.',
    ]);
    expect(screen.getByText(/sign in once more there/)).toBeInTheDocument();
  });

  it("names Mac Safari's menu, with nothing to press", () => {
    route = 'mac-safari';
    render(<InstallCard />);
    expect(screen.getByText('File › Add to Dock')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
