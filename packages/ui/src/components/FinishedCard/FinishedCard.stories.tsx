import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FinishedCard } from './FinishedCard';

const onAgain = fn();

const meta = {
  title: 'Playback/FinishedCard',
  component: FinishedCard,
  args: {
    detail: '1h 3m over 4 days',
    action: { label: 'Back to library', onClick: fn() },
    secondary: { label: 'Play again', onClick: onAgain },
    wash: '217, 164, 65',
  },
  // The card is a container itself; the page gives it a width.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FinishedCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Now Playing on a desk: one row, the words then the two pills. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('region', { name: 'Finished' })).toHaveTextContent('1h 3m over 4 days');
    await userEvent.click(c.getByRole('button', { name: 'Play again' }));
    await expect(onAgain).toHaveBeenCalledTimes(1);
    await userEvent.click(c.getByRole('button', { name: 'Back to library' }));
    await expect(args.action.onClick).toHaveBeenCalledTimes(1);
  },
};
/** Phone width: the actions on a row of their own under the words. */
export const Phone: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '335px' }}>
        <Story />
      </div>
    ),
  ],
};
/** Nothing truthful to add: the word alone. */
export const NoDetail: Story = { args: { detail: undefined } };
/** One way on only. */
export const ActionOnly: Story = { args: { secondary: undefined } };
export const NoWash: Story = { args: { wash: null } };
