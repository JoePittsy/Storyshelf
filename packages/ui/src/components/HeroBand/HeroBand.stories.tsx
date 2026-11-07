import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { covers, portraitCover } from '../../../.storybook/fixtures';
import { Artwork } from '../Artwork';
import { PersonChip } from '../PersonChip';
import { PillButton } from '../PillButton';
import { HeroBand } from './HeroBand';

const meta = {
  title: 'Common/HeroBand',
  component: HeroBand,
  args: {
    art: <img src={covers.ocean} alt="" />,
    kind: 'Collection',
    title: 'Deep Water',
    wash: '31, 143, 255',
    children: <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 items</p>,
  },
  // Detail pages are a container, so the band stacks when narrow.
  decorators: [
    (Story) => (
      <div style={{ containerType: 'inline-size' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoWash: Story = { args: { wash: null } };

const art = (src: string, fit: 'cover' | 'contain') => <Artwork src={src} fit={fit} lazy={false} />;
export const SquareCover: Story = { args: { art: art(covers.ocean, 'cover') } };
export const SquareContain: Story = { args: { art: art(covers.ocean, 'contain') } };
/** A 2:3 print cover in the square frame: `cover` crops the edge text. */
export const PortraitCover: Story = { args: { art: art(portraitCover, 'cover'), wash: '217, 164, 65' } };
/** The whole cover shows over a blurred copy of itself; the frame stays square. */
export const PortraitContain: Story = { args: { art: art(portraitCover, 'contain'), wash: '217, 164, 65' } };
export const NoArt: Story = {
  args: {
    art: (
      <span style={{ display: 'grid', placeItems: 'center', height: '100%' }} aria-hidden="true">
        ◌
      </span>
    ),
  },
};
export const EditableTitle: Story = {
  args: { kind: 'Playlist', title: 'Friday afternoon', onTitleClick: fn(), titleHint: 'Rename playlist' },
};
export const WithCorner: Story = {
  args: {
    corner: <PersonChip name="Priya Shah" selected={false} onClick={fn()} />,
    children: (
      <>
        <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 items</p>
        <p style={{ margin: 0 }}>Added 3 times</p>
      </>
    ),
  },
};
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Collection That Needs to Wrap Without Pushing the Artwork Around',
  },
};

/** A container `width` wide, for the layouts the band takes at phone and desk widths. */
const sized =
  (width: string): Decorator =>
  (Story) => (
    <div style={{ containerType: 'inline-size', width }}>
      <Story />
    </div>
  );
const bookLines = (
  <>
    <p style={{ margin: 0 }}>Arthur Conan Doyle · Narrated by Phil Chenevert</p>
    <p style={{ margin: 0 }}>Sherlock Holmes #2 · 1h 3m long</p>
    <PillButton variant="primary" icon="play">
      Resume · 51m left
    </PillButton>
  </>
);
const box = (el: Element | null | undefined) => {
  if (!el) throw new Error('missing element');
  return el.getBoundingClientRect();
};

/**
 * A phone: the art steps down and sits beside the title, and the lines under the title (credits, the action) run the
 * band's full width beneath them, so the action is on the first screen.
 */
export const Phone: Story = {
  args: {
    art: <img src={portraitCover} alt="" data-testid="art" />,
    kind: undefined,
    title: 'The Adventure of the Copper Beeches',
    wash: '217, 164, 65',
    children: bookLines,
  },
  decorators: [sized('22em')],
  play: async ({ canvas, canvasElement }) => {
    const art = box(canvasElement.querySelector('[data-testid="art"]')?.parentElement);
    const heading = canvas.getByRole('heading', { level: 1 });
    const title = box(heading);
    const button = box(canvas.getByRole('button', { name: 'Resume · 51m left' }));
    const em = parseFloat(getComputedStyle(canvasElement.querySelector('header')!).fontSize);
    await expect(art.width).toBeLessThanOrEqual(8 * em);
    // Beside the title, which is centred against it.
    await expect(title.left).toBeGreaterThan(art.right);
    await expect(Math.abs(title.top + title.height / 2 - (art.top + art.height / 2))).toBeLessThan(em);
    // The whole title shows: it may take up to four lines here.
    await expect(heading.scrollHeight).toBeLessThanOrEqual(heading.clientHeight + 1);
    // The rest below the art, from the band's left edge.
    await expect(button.top).toBeGreaterThanOrEqual(art.bottom);
    await expect(Math.abs(button.left - art.left)).toBeLessThan(1);
  },
};
/** A kind over a short name, as on an author or series page. */
export const PhoneWithKind: Story = {
  args: {
    kind: 'Series',
    title: 'Sherlock Holmes',
    children: <p style={{ margin: 0 }}>Arthur Conan Doyle · 2 books</p>,
  },
  decorators: [sized('22em')],
};
/** A desk: the art beside everything, the lines in the text column. */
export const Wide: Story = {
  args: {
    art: <img src={covers.ocean} alt="" data-testid="art" />,
    title: 'The Adventure of the Copper Beeches',
    children: bookLines,
  },
  decorators: [sized('900px')],
  play: async ({ canvas, canvasElement }) => {
    const art = box(canvasElement.querySelector('[data-testid="art"]')?.parentElement);
    const button = box(canvas.getByRole('button', { name: 'Resume · 51m left' }));
    await expect(button.left).toBeGreaterThan(art.right);
    await expect(art.width).toBeGreaterThanOrEqual(
      12 * parseFloat(getComputedStyle(canvasElement.querySelector('header')!).fontSize)
    );
  },
};
