import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SkipButton } from './SkipButton';

// A circular arrow with the seconds inside. Stateless: it only calls onClick.
const meta = {
  title: 'Playback/SkipButton',
  component: SkipButton,
  args: { direction: 'back', seconds: 30, onClick: fn() },
} satisfies Meta<typeof SkipButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Back: Story = {};
export const Forward: Story = { args: { direction: 'forward' } };
export const Large: Story = { args: { size: 'lg', seconds: 15 } };
export const OneDigit: Story = { args: { seconds: 5 } };
export const Disabled: Story = { args: { disabled: true } };
