import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from './Tabs';

const items = [
  { key: 'books', label: 'Library', href: '/' },
  { key: 'history', label: 'History', href: '/history' },
  { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings' as const, separated: true },
];

describe('Tabs', () => {
  it('marks the current tab and navigates on a plain click', () => {
    const onNavigate = vi.fn();
    render(<Tabs label="Sections" items={items} current="settings" onNavigate={onNavigate} />);
    const settings = screen.getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('link', { name: 'History' }));
    expect(onNavigate).toHaveBeenCalledWith('/history');
  });

  it('keeps an icon tab named by its label, with the icon hidden from assistive tech', () => {
    const { container } = render(<Tabs label="Sections" items={items} current="books" onNavigate={() => {}} />);
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
