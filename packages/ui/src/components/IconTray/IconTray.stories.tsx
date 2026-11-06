import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
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
            setSleep(c === 'off' ? null : c === 'chapter' ? { kind: 'chapter' } : { kind: 'minutes', remainingMs: c.minutes * 60000 })
          }
        />
        <TrayButton icon="chapters" label="Chapters" onClick={fn()} />
        <TrayButton icon="history" label="History" onClick={fn()} />
      </IconTray>
    </div>
  );
}

// The phone player's full tray, at an iPhone SE's width: adding a bookmark and opening the list join the others.
function WithBookmarks() {
  const [rate, setRate] = useState(1);
  return (
    <div style={{ width: 'min(100%, 21.5em)' }}>
      <IconTray label="Player options">
        <SpeedControl value={rate} onChange={setRate} fixedDecimal />
        <SleepTimerControl compact value={null} onChange={fn()} />
        <TrayButton icon="chapters" label="Chapters" onClick={fn()} />
        <TrayButton icon="bookmark" label="Add bookmark" onClick={fn()} />
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
export const Bookmarks: Story = { render: () => <WithBookmarks /> };
