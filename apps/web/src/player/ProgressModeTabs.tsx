import { SegmentedControl } from '@joepittsy/ui';
import { usePlayer } from './engine';
import { useProgress } from './progressMode';
import type { ProgressMode } from './progressWindow';

/**
 * Whole book / This chapter, and Sleep while a timer is set: a compact text switch for what the progress bar spans, on
 * phones. Only the modes on offer appear (a book with no chapters has just one, so there is no switch). The words are
 * the ones the tap-to-change flash uses, and a tap on the bar moves this switch too: both read the same stored mode.
 */
export function ProgressModeTabs({ className }: { className?: string }) {
  const { mode, setMode, sleepActive } = useProgress();
  const hasChapters = usePlayer().chapters.length > 0;
  const options: { value: ProgressMode; label: string }[] = [{ value: 'book', label: 'Whole book' }];
  if (hasChapters) options.push({ value: 'chapter', label: 'This chapter' });
  if (sleepActive) options.push({ value: 'sleep', label: 'Sleep' });
  if (options.length < 2) return null;
  return (
    <SegmentedControl<ProgressMode>
      className={className}
      variant="underline"
      label="Progress bar shows"
      value={mode}
      onChange={setMode}
      options={options}
    />
  );
}
