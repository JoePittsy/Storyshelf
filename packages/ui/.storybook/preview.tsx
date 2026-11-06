import type { ReactNode } from 'react';
import type { Preview } from '@storybook/react-vite';
import '@fontsource-variable/manrope';
import '../src/styles/index.css';

/**
 * `parameters.frame`: 'padded' (default) is a scrolling box on the page ground with the page scale applied;
 * 'bare' renders the story with nothing around it (for a story that supplies its own root).
 */
type Frame = 'padded' | 'bare';

function StoryFrame({ children, frame }: { children: ReactNode; frame: Frame }) {
  if (frame === 'bare') return <>{children}</>;
  return (
    <div
      className="page-scale"
      style={{ minHeight: '100vh', overflow: 'auto', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}
    >
      {children}
    </div>
  );
}

const preview: Preview = {
  decorators: [
    (Story, { id, parameters }) => (
      <StoryFrame key={id} frame={(parameters.frame as Frame | undefined) ?? 'padded'}>
        <Story />
      </StoryFrame>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disabled: true },
    // axe runs on every story in the story tests: a violation fails the test. Narrow exceptions go on the story, with a reason.
    a11y: { test: 'error' },
  },
};

export default preview;
