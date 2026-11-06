import type { Meta, StoryObj } from '@storybook/react-vite';
import { portrait } from '../../../.storybook/fixtures';
import card from '../PersonCard/PersonCard.module.css';
import chip from '../PersonChip/PersonChip.module.css';
import { UserAvatar } from './UserAvatar';

const meta = {
  title: 'Common/UserAvatar',
  component: UserAvatar,
  // With no className it is a 2em circle; a caller's class sets its own size and shape.
  args: { name: 'Priya Shah', imageUrl: portrait },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 'var(--fs-glyph-sm)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPhoto: Story = {};
/** No photo: the initial on a gradient that is the same every time for a given name. */
export const Initial: Story = { args: { imageUrl: null } };
/** A photo that fails to load falls back to the initial. */
export const BrokenImage: Story = { args: { imageUrl: 'data:image/png;base64,broken' } };
/** The same person at the sizes the other components give a face. */
export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2em', padding: '0.6em' }}>
      {[undefined, chip.avatar, card.avatar].map((c) => (
        <UserAvatar key={c ?? 'default'} {...args} className={c} />
      ))}
      <UserAvatar {...args} name="Tom Ellis" imageUrl={null} />
    </div>
  ),
};
export const OtherNames: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: '0.4em' }}>
      {['Aisha Khan', 'Tom Ellis', 'Zoe Whitaker', 'Joe Pitts', 'Maya Rowan'].map((n) => (
        <UserAvatar key={n} {...args} name={n} imageUrl={null} />
      ))}
    </div>
  ),
};
