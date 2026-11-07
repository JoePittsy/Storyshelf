import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { GrabSheet } from './GrabSheet';

// A full-height sheet you can pull down: grab handle, chevron-down close button, drag to dismiss (distance or flick).
const meta = {
  title: 'Layout/GrabSheet',
  component: GrabSheet,
  args: { onDismiss: fn(), closeLabel: 'Close player', children: null },
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <GrabSheet {...args} className="demo">
      <div style={{ padding: '1em', background: 'var(--bg)', minHeight: '60vh' }}>
        <p>
          Drag the handle (or anywhere quiet) down to dismiss. The chevron does the same for anyone who can't swipe.
        </p>
      </div>
    </GrabSheet>
  ),
} satisfies Meta<typeof GrabSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
