import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

type Mode = 'book' | 'chapter' | 'sleep';

function Demo({ sleepOff }: { sleepOff?: boolean }) {
  const [value, setValue] = useState<Mode>('book');
  return (
    <SegmentedControl<Mode>
      label="Progress bar shows"
      value={value}
      onChange={setValue}
      options={[
        { value: 'book', label: 'Book' },
        { value: 'chapter', label: 'Chapter' },
        { value: 'sleep', label: 'Sleep', disabled: sleepOff, reason: 'Set a sleep timer to use this' },
      ]}
    />
  );
}

const meta = { title: 'Playback/SegmentedControl', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The disabled option stays visible; the reason is its tooltip and accessible description. */
export const OptionDisabled: Story = { args: { sleepOff: true } };
