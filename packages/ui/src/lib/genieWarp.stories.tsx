import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers, portraitCover } from '../../.storybook/fixtures';
import { tFromScroll } from './genieMath';
import { createGenie, measureBox, type Genie } from './genieWarp';

const frame = {
  position: 'absolute',
  overflow: 'hidden',
  borderRadius: 16,
  outline: '2px dashed var(--text-3)',
  outlineOffset: 4,
} as const;
const fill = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' } as const;

type Cover = 'portrait' | 'square';
const sources: Record<Cover, string> = { portrait: portraitCover, square: covers.sunset };

/** One genie for the story's lifetime per cover; `ready` flips once the texture is uploaded. */
function useGenie(src: string) {
  const [genie, setGenie] = useState<Genie | null>(null);
  const [version, bump] = useState(0);
  useEffect(() => {
    const g = createGenie({ src, onChange: () => bump((n) => n + 1) });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the genie owns a WebGL context, so it is created in an effect
    setGenie(g);
    return () => g?.destroy();
  }, [src]);
  return { genie, version };
}

type Props = { t: number; cover: Cover; sizeA: number; sizeB: number };

/**
 * Two squares placed as in the docking layout: A the hero, top left; B the docked cover, lower right. The `t` slider
 * scrubs the warp between them. Static: nothing animates on its own, so it is stable under the test runner.
 */
function GenieDemo({ t, cover, sizeA, sizeB }: Props) {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const src = sources[cover];
  const { genie, version } = useGenie(src);
  const live = !!genie && genie.ready && !genie.failed && t > 0 && t < 1;

  useLayoutEffect(() => {
    if (!genie || !a.current || !b.current) return;
    const from = measureBox(a.current);
    const to = measureBox(b.current);
    if (!from || !to) return;
    genie.prepare(from);
    if (live) genie.draw(from, to, t);
    else genie.hide();
  }, [genie, version, live, t, sizeA, sizeB, cover]);

  const img = <img src={src} alt="" style={fill} />;
  return (
    <div style={{ position: 'relative', width: 900, height: 620, margin: 16 }}>
      <div
        ref={a}
        style={{
          ...frame,
          left: 40,
          top: 30,
          width: sizeA,
          height: sizeA,
          visibility: t >= 1 || live ? 'hidden' : 'visible',
        }}
      >
        {img}
      </div>
      <div
        ref={b}
        style={{
          ...frame,
          left: 900 - 60 - sizeB,
          top: 620 - 50 - sizeB,
          width: sizeB,
          height: sizeB,
          visibility: t >= 1 ? 'visible' : 'hidden',
        }}
      >
        {img}
      </div>
    </div>
  );
}

const meta = {
  title: 'Motion/Genie warp',
  component: GenieDemo,
  parameters: { layout: 'fullscreen' },
  args: { t: 0.5, cover: 'portrait', sizeA: 280, sizeB: 144 },
  argTypes: {
    t: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    cover: { control: 'inline-radio', options: ['portrait', 'square'] },
  },
} satisfies Meta<typeof GenieDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-warp: the portrait cover squeezing through the neck. */
export const Portrait: Story = {};
export const Square: Story = { args: { cover: 'square', t: 0.35 } };
/** t = 0 and t = 1 are the real covers: the warp lands exactly on each. */
export const AtStart: Story = { args: { t: 0 } };
export const AtEnd: Story = { args: { t: 1 } };

/**
 * Scrolling drives t: the cover at the top of the scroller pours into the dock on the right as it passes under the
 * scroller's top edge (standing in for the top bar).
 */
function ScrollDemo({ cover }: { cover: Cover }) {
  const scroller = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const src = sources[cover];
  const { genie, version } = useGenie(src);
  const live = !!genie && genie.ready && !genie.failed && t > 0 && t < 1;

  useEffect(() => {
    const el = scroller.current;
    const h = hero.current;
    if (!el || !h) return;
    const update = () => {
      const r = h.getBoundingClientRect();
      setT(tFromScroll(r.top, r.height, el.getBoundingClientRect().top));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, []);

  useLayoutEffect(() => {
    if (!genie || !hero.current || !dock.current) return;
    const from = measureBox(hero.current);
    const to = measureBox(dock.current);
    if (!from || !to) return;
    genie.prepare(from);
    if (live) genie.draw(from, to, t);
    else genie.hide();
  }, [genie, version, live, t]);

  const img = <img src={src} alt="" style={fill} />;
  return (
    <div style={{ position: 'relative', width: 900, height: 560, margin: 16 }}>
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Scroll to pour the cover into the dock"
        style={{ position: 'absolute', inset: '0 260px 0 0', overflow: 'auto', border: '1px solid var(--text-3)' }}
      >
        <div style={{ position: 'relative', height: 1600, padding: 24 }}>
          <div
            ref={hero}
            style={{
              ...frame,
              position: 'relative',
              width: 260,
              height: 260,
              visibility: t > 0 ? 'hidden' : 'visible',
            }}
          >
            {t === 0 && img}
          </div>
          <p style={{ maxWidth: 360, color: 'var(--text-2)' }}>
            Scroll down: the cover pours into the dock on the right.
          </p>
        </div>
      </div>
      <div
        ref={dock}
        style={{ ...frame, right: 50, top: 40, width: 144, height: 144, visibility: t >= 1 ? 'visible' : 'hidden' }}
      >
        {t >= 1 && img}
      </div>
    </div>
  );
}

export const ScrollDriven: StoryObj<{ cover: Cover }> = {
  render: (args) => <ScrollDemo cover={args.cover} />,
  args: { cover: 'portrait' },
  argTypes: { cover: { control: 'inline-radio', options: ['portrait', 'square'] } },
};
