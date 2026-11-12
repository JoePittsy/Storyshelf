import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { SleepTimerControl } from '../SleepTimerControl';
import type { SleepValue } from '../SleepTimerControl';
import { SpeedControl } from '../SpeedControl';
import { IconTray, TrayButton } from './IconTray';

// The quiet secondary row under a player's transport: one tonal container, every control the same kind of button.
function Demo() {
  const [rate, setRate] = useState(1);
  const [sleep, setSleep] = useState<SleepValue>(null);
  return (
    <div style={{ width: 'min(100%, 24em)' }}>
      <IconTray label="Player options">
        <SpeedControl value={rate} onChange={setRate} fixedDecimal />
        <SleepTimerControl
          compact
          value={sleep}
          onChange={(c) =>
            setSleep((cur) =>
              c === 'off'
                ? null
                : c === 'chapter'
                  ? { kind: 'chapter' }
                  : 'addMinutes' in c
                    ? cur?.kind === 'minutes'
                      ? { kind: 'minutes', remainingMs: cur.remainingMs + c.addMinutes * 60000 }
                      : cur
                    : { kind: 'minutes', remainingMs: c.minutes * 60000 }
            )
          }
        />
        <TrayButton icon="chapters" label="Chapters" onClick={fn()} />
        <TrayButton icon="history" label="History" onClick={fn()} />
      </IconTray>
    </div>
  );
}

// The phone player's full tray, at an iPhone SE's width: Bookmarks joins the others (adding one happens in its list).
function WithBookmarks({ sleep = null }: { sleep?: SleepValue }) {
  const [rate, setRate] = useState(1);
  return (
    <div style={{ width: 'min(100%, 21.5em)' }}>
      <IconTray label="Player options">
        <SpeedControl value={rate} onChange={setRate} fixedDecimal />
        <SleepTimerControl compact value={sleep} onChange={fn()} />
        <TrayButton icon="chapters" label="Chapters" onClick={fn()} />
        <TrayButton icon="bookmarks" label="Bookmarks" onClick={fn()} />
        <TrayButton icon="history" label="History" onClick={fn()} />
      </IconTray>
    </div>
  );
}

const meta = { title: 'Playback/IconTray', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
// Five controls at an SE's width: no icon may be squeezed below its size, and no value may spill out of its button.
const fitsAtSeWidth: Story['play'] = async ({ canvasElement }) => {
  const buttons = Array.from(
    canvasElement.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button, nav button, ul button, div button')
  ).filter((b) => !b.closest('[popover]'));
  await expect(buttons.length).toBe(5);
  for (const b of buttons) {
    await expect(b.scrollWidth).toBeLessThanOrEqual(b.clientWidth + 1);
    for (const svg of Array.from(b.querySelectorAll('svg'))) {
      if (getComputedStyle(svg).display === 'none') continue;
      const { width, height } = svg.getBoundingClientRect();
      await expect(Math.round(width)).toBe(Math.round(height));
    }
  }
};
export const Bookmarks: Story = { render: () => <WithBookmarks />, play: fitsAtSeWidth };
/** An end-of-chapter timer running: the cell shows its time left, never the words "End of chapter". */
export const ChapterTimer: Story = {
  render: () => <WithBookmarks sleep={{ kind: 'chapter', remainingMs: 672000 }} />,
  play: fitsAtSeWidth,
};
