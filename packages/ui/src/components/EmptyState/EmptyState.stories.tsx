import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, SearchX } from 'lucide-react';
import { PillButton } from '../PillButton';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Common/EmptyState',
  component: EmptyState,
  args: { title: 'Nothing here yet' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoResults: Story = {
  args: {
    icon: SearchX,
    title: 'No results',
    children: 'Nothing matches “pratchet”. Check the spelling or try a shorter search.',
  },
};
export const WithAction: Story = {
  args: {
    icon: BookOpen,
    title: 'This library is empty',
    children: 'Add a folder of audiobooks on your server and it will appear here.',
    action: <PillButton variant="primary">Refresh library</PillButton>,
  },
};
export const Minimal: Story = {};
