import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './TextField';

const meta = {
  title: 'Common/TextField',
  component: TextField,
  args: { label: 'Username', name: 'username', autoComplete: 'username' },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'The name you use on your Audiobookshelf server.' } };
export const WithError: Story = { args: { error: 'Enter your username.', defaultValue: '' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'joe' } };
export const Password: Story = {
  args: { label: 'Password', name: 'password', type: 'password', autoComplete: 'current-password' },
};
