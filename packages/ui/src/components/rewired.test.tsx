import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtCard } from './ArtCard';
import { Artwork } from './Artwork';
import { ChartHead, ChartRow } from './ChartRow';
import { PeopleLinks, TitleButton } from './ItemLinks';
import { ItemRow } from './ItemRow';
import { TopResultCard } from './TopResultCard';
import { UserAvatar } from './UserAvatar';

const img = (c: HTMLElement) => c.querySelector('img') as HTMLImageElement;

describe('PeopleLinks', () => {
  it('keeps each comma with the name before it, so a wrapped line never starts with ", "', () => {
    const { container } = render(<PeopleLinks people="Dr. Dre, Snoop Dogg, Kurupt" onOpenPerson={() => {}} />);
    expect(container.textContent).toBe('Dr. Dre, Snoop Dogg, Kurupt');
    const unit = (name: string) => screen.getByRole('button', { name: `${name}, open` }).textContent;
    expect(unit('Dr. Dre')).toBe('Dr. Dre,');
    expect(unit('Snoop Dogg')).toBe('Snoop Dogg,');
    expect(unit('Kurupt')).toBe('Kurupt');
  });

  it('reports the name and whether it is the first, without bubbling', () => {
    const onOpenPerson = vi.fn();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <PeopleLinks people="A, B" onOpenPerson={onOpenPerson} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'B, open' }));
    expect(onOpenPerson).toHaveBeenCalledWith('B', false);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('PeopleLinks and TitleButton with an href', () => {
  const hrefFor = (name: string) => `/people/${name}`;

  it('renders real links named by the name alone, keeping the comma inside the link text', () => {
    const { container } = render(<PeopleLinks people="A, B" onOpenPerson={() => {}} hrefFor={hrefFor} />);
    expect(container.textContent).toBe('A, B');
    const a = screen.getByRole('link', { name: 'A' });
    expect(a).toHaveAttribute('href', '/people/A');
    expect(a.textContent).toBe('A,');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('routes a plain click, and leaves modified and middle clicks to the browser', () => {
    const onOpenPerson = vi.fn();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <PeopleLinks people="A, B" onOpenPerson={onOpenPerson} hrefFor={hrefFor} />
      </div>
    );
    const b = screen.getByRole('link', { name: 'B' });
    expect(fireEvent.click(b, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(b, { metaKey: true })).toBe(true);
    expect(fireEvent.click(b, { button: 1 })).toBe(true);
    expect(onOpenPerson).not.toHaveBeenCalled();
    // The default is prevented for the plain click only, so the browser does not also navigate.
    expect(fireEvent.click(b)).toBe(false);
    expect(onOpenPerson).toHaveBeenCalledExactlyOnceWith('B', false);
    expect(outer).not.toHaveBeenCalled();
  });

  it('stays a button for a name hrefFor has no destination for', () => {
    render(
      <PeopleLinks people="A, B" onOpenPerson={() => {}} hrefFor={(n) => (n === 'A' ? '/people/A' : undefined)} />
    );
    expect(screen.getByRole('link', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B, open' })).toBeInTheDocument();
  });

  it('TitleButton with an href is a link: a plain click opens, a modified click does not', () => {
    const onOpen = vi.fn();
    render(<TitleButton title="Golden Hour" href="/series/1" onOpen={onOpen} />);
    const a = screen.getByRole('link', { name: 'Golden Hour' });
    expect(a).toHaveAttribute('href', '/series/1');
    fireEvent.click(a, { shiftKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(a);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('ItemRow and ChartRow', () => {
  it('ItemRow: the title button opens, + adds with a generic label', () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    render(
      <ul>
        <ItemRow title="Golden Hour" credit="Maya" onOpen={onOpen} onAdd={onAdd} />
      </ul>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Golden Hour, open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Golden Hour' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('ChartRow: zero-pads the rank and shows the count; ChartHead is decorative', () => {
    const { container } = render(
      <>
        <ChartHead />
        <ol>
          <ChartRow rank={3} title="Golden Hour" credit="Maya" count={27} onOpen={() => {}} />
        </ol>
      </>
    );
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('#TitleCreditCount');
  });
});

describe('plain images with a fallback', () => {
  it('Artwork renders a lazy img, and the placeholder once it fails', () => {
    const { container } = render(<Artwork src="https://example.com/a.png" />);
    expect(img(container)).toHaveAttribute('loading', 'lazy');
    fireEvent.error(img(container));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
  });

  it('Artwork tries again for a new URL', () => {
    const { container, rerender } = render(<Artwork src="https://example.com/a.png" />);
    fireEvent.error(img(container));
    rerender(<Artwork src="https://example.com/b.png" />);
    expect(img(container)).toHaveAttribute('src', 'https://example.com/b.png');
  });

  it('UserAvatar falls back to the initial when the photo fails', () => {
    const { container } = render(<UserAvatar name="Priya Shah" imageUrl="https://example.com/p.png" />);
    fireEvent.error(img(container));
    expect(container.querySelector('img')).toBeNull();
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--initial')).toBe('"P"');
  });

  it('ArtCard drops a cover that fails to load but keeps the caption and open button', () => {
    const { container } = render(
      <ArtCard
        size="large"
        label="Pick"
        title="Golden Hour"
        imageUrl="https://example.com/c.png"
        onOpen={() => {}}
        openLabel="Open Golden Hour"
      />
    );
    fireEvent.error(img(container));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Golden Hour' })).toBeInTheDocument();
    expect(screen.getByText('Golden Hour')).toBeInTheDocument();
  });

  it('TopResultCard takes a custom heading and drops art that fails', () => {
    const { container } = render(
      <TopResultCard
        title="T"
        heading="Best match"
        imageUrl="https://example.com/c.png"
        onOpen={() => {}}
        openLabel="Open T"
      />
    );
    expect(screen.getByRole('heading', { name: 'Best match' })).toBeInTheDocument();
    fireEvent.error(img(container));
    expect(container.querySelector('img')).toBeNull();
  });
});
