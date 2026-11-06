import { useLayoutEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers } from '../../.storybook/fixtures';
import { PillButton } from '../components/PillButton';
import { createMorphOverlay, measureBox, morphBetween } from './morphBetween';

const frame = {
  position: 'absolute',
  overflow: 'hidden',
  borderRadius: 16,
  outline: '2px dashed var(--text-3)',
  outlineOffset: 4,
} as const;

type Props = {
  src: string;
  color: string;
  duration: number;
  progress?: number;
  sizeA: number;
  sizeB: number;
  near?: boolean;
};

/**
 * Two squares placed as in a docking layout: A the hero, top left; B the docked cover, lower right. The buttons pour the
 * cover from one to the other. Nothing animates on load, so the story is static under the test runner; set
 * `progress` to pin the overlay at one moment of the morph.
 */
function MorphDemo({ src, color, duration, progress, sizeA, sizeB, near }: Props) {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<'A' | 'B'>('A');
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    if (progress === undefined || !a.current || !b.current) return;
    const from = measureBox(a.current);
    const to = measureBox(b.current);
    if (!from || !to) return;
    const overlay = createMorphOverlay({ src, color });
    overlay.update(from, to, progress);
    a.current.style.visibility = b.current.style.visibility = 'hidden';
    return () => overlay.destroy();
  }, [progress, src, color, sizeA, sizeB, near]);

  const go = async (dir: 'A' | 'B') => {
    if (busy || !a.current || !b.current) return;
    setBusy(true);
    const [from, to] = dir === 'B' ? [a.current, b.current] : [b.current, a.current];
    await morphBetween(from, to, { src, color, duration });
    setAt(dir);
    setBusy(false);
  };

  const img = (
    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
  );
  return (
    <div style={{ position: 'relative', width: 900, height: 620, margin: 16 }}>
      <div ref={a} style={{ ...frame, left: 40, top: 30, width: sizeA, height: sizeA }}>
        {at === 'A' && img}
      </div>
      <div
        ref={b}
        style={{
          ...frame,
          left: near ? 40 + sizeA + 24 : 900 - 60 - sizeB,
          top: near ? 30 + sizeA * 0.55 : 620 - 50 - sizeB,
          width: sizeB,
          height: sizeB,
        }}
      >
        {at === 'B' && img}
      </div>
      <div style={{ position: 'absolute', left: 330, top: 30, display: 'flex', gap: 12 }}>
        <PillButton onClick={() => void go('B')} disabled={busy || at === 'B'}>
          Morph A to B
        </PillButton>
        <PillButton onClick={() => void go('A')} disabled={busy || at === 'A'}>
          Morph B to A
        </PillButton>
      </div>
    </div>
  );
}

const meta = {
  title: 'Motion/Morph between',
  component: MorphDemo,
  parameters: { layout: 'fullscreen' },
  args: { src: covers.sunset, color: '255, 122, 69', duration: 900, sizeA: 240, sizeB: 144 },
  argTypes: { progress: { control: { type: 'range', min: 0, max: 1, step: 0.05 } } },
} satisfies Meta<typeof MorphDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The overlay pinned at the moment both squares are full size and joined by the neck. */
export const Midway: Story = { args: { progress: 0.5 } };
export const ShortDiagonal: Story = { args: { sizeA: 200, sizeB: 140, near: true, progress: 0.5 } };
