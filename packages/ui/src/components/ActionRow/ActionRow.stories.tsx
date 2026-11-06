import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActionRow } from './ActionRow';

const onRename = fn();
const onDelete = fn();

const meta = {
  title: 'Common/ActionRow',
  component: ActionRow,
  args: {
    title: 'Where the keeper finds the logbook',
    detail: 'Chapter 7: The tide table',
    trailing: '1:02:10',
    onOpen: fn(),
    actions: [
      { icon: 'rename', label: 'Rename Where the keeper finds the logbook', onClick: onRename },
      { icon: 'delete', label: 'Delete Where the keeper finds the logbook', onClick: onDelete },
    ],
  },
  // Rows render inside a list; the list's width decides how much the title gets.
  decorators: [
    (Story, { parameters }) => (
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxWidth: (parameters.width as string | undefined) ?? '36em',
        }}
      >
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: /^Where the keeper finds the logbook/ }));
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
    await userEvent.click(c.getByRole('button', { name: 'Rename Where the keeper finds the logbook' }));
    await expect(onRename).toHaveBeenCalled();
    await userEvent.click(c.getByRole('button', { name: 'Delete Where the keeper finds the logbook' }));
    await expect(onDelete).toHaveBeenCalled();
    // The actions never open the row.
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};
export const TitleOnly: Story = { args: { detail: undefined, trailing: undefined } };
export const NoActions: Story = { args: { actions: [] } };
export const LongTitle: Story = {
  args: { title: 'In which the keeper, having at last run out of candles, reads the whole logbook aloud to the gulls' },
};
/** A phone-width list: the title wraps, the time and the actions keep their room. */
export const Narrow: Story = { parameters: { width: '20em' } };
