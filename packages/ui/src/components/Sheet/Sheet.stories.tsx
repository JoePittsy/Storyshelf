import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PillButton } from '../PillButton';
import { SpeedControl } from '../SpeedControl';
import { Sheet } from './Sheet';

// Native <dialog>: a bottom sheet under 40em wide, a centred panel above. Open on load so each story shows it.
const chapters = Array.from({ length: 24 }, (_, i) => `Chapter ${i + 1}`);

const meta = {
  title: 'Playback/Sheet',
  component: Sheet,
  args: {
    open: true,
    onClose: fn(),
    title: 'Chapters',
    children: (
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.8em' }}>
        {chapters.slice(0, 5).map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    ),
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = {};
/** The body scrolls; the title and close button stay put. */
export const Scrolling: Story = {
  args: {
    children: (
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.8em' }}>
        {chapters.map((c) => (
          <li key={c}>
            <PillButton>{c}</PillButton>
          </li>
        ))}
      </ul>
    ),
  },
};

/** A popover opened inside the sheet is not clipped by it. */
export const WithPopover: Story = {
  args: { title: 'Playback', children: <SpeedControl value={1} onChange={fn()} /> },
};

function Toggler() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PillButton variant="primary" onClick={() => setOpen(true)}>
        Open sheet
      </PillButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="Chapters">
        <p>Esc, the close button or a click outside closes it.</p>
      </Sheet>
    </>
  );
}
/** Closed until the button is pressed; focus returns to it on close. */
export const Closed: Story = { render: () => <Toggler /> };
