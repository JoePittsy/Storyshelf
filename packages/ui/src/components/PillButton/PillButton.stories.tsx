import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { PillButton } from './PillButton';

const meta = {
  title: 'Common/PillButton',
  component: PillButton,
  args: { children: 'Add to shelf', onClick: fn() },
} satisfies Meta<typeof PillButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};
export const Primary: Story = { args: { variant: 'primary', children: 'Play next' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete playlist' } };
export const Disabled: Story = { args: { disabled: true } };
export const Submit: Story = { args: { variant: 'primary', type: 'submit', children: 'Create' } };
/** The play action wherever there is one: the filled glyph the home Resume action uses, then the words. */
export const PlayGlyph: Story = {
  args: { variant: 'primary', icon: 'play', children: 'Resume · 51m left' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Resume · 51m left' });
    const glyph = button.querySelector('svg');
    await expect(glyph).not.toBeNull();
    await expect(glyph).toHaveAttribute('aria-hidden', 'true');
    // Filled, as on the home Resume action, and sized from the label so it follows the page scale.
    await expect(glyph).toHaveAttribute('fill', 'currentColor');
    await expect(button.firstElementChild).toBe(glyph);
  },
};
export const PauseGlyph: Story = { args: { variant: 'primary', icon: 'pause', children: 'Pause' } };
