import { SegmentedControl } from '@joepittsy/ui';
import { useProgress } from './progressMode';
import type { ProgressMode } from './progressWindow';

/** Book / Chapter / Sleep: what the progress bar spans. Sleep is only available while a sleep timer runs (REQ-45, REQ-48). */
export function ProgressModeControl({ className }: { className?: string }) {
  const { mode, setMode, sleepActive } = useProgress();
  return (
    <SegmentedControl<ProgressMode>
      className={className}
      label="Progress bar shows"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'book', label: 'Book' },
        { value: 'chapter', label: 'Chapter' },
        { value: 'sleep', label: 'Sleep', disabled: !sleepActive, reason: 'Set a sleep timer to use this' },
      ]}
    />
  );
}
