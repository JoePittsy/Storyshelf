# @joepittsy/ui

The Storyshelf design system: tokens (CSS custom properties) and React components. Dark, calm, content-led. It has no knowledge of any app. See [DESIGN.md](./DESIGN.md) for the rules and [FORKED_FROM.md](./FORKED_FROM.md) for where it came from.

## Develop

Run from the repo root (Node 24, pnpm via corepack).

```bash
pnpm install
pnpm --filter @joepittsy/ui storybook          # component workshop on :6006
pnpm --filter @joepittsy/ui test               # unit tests, then every story in Chromium with axe (violations fail)
pnpm --filter @joepittsy/ui exec playwright install chromium   # once, for the story tests
pnpm --filter @joepittsy/ui build              # dist/: ESM JS, styles.css, .d.ts
pnpm --filter @joepittsy/ui build-storybook
pnpm lint                                      # eslint, stylelint (tokens only) and designmd lint
pnpm typecheck
```

Every component has a story, and the story tests run axe on each one. Colours, radii, font sizes and shadows come from tokens in `src/styles/global.css` and `depth.css`; Stylelint rejects raw values anywhere else. If you add a token, name it in `DESIGN.md` or the sync test fails.

## Use

Import the font and the CSS once, at the root of the app, and wrap the UI in `.page-scale` (it sets the `em` base, font and text colour). Set the page background yourself.

```tsx
import '@fontsource-variable/manrope'; // the font is yours to load; see below
import '@joepittsy/ui/styles.css';
import { SectionCard, ItemRow } from '@joepittsy/ui';

export function App() {
  return (
    <div className="page-scale" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SectionCard title="Reading now">…</SectionCard>
    </div>
  );
}
```

`react`, `react-dom` and `@fontsource-variable/manrope` are peer dependencies. The package does not bundle the font (so its SIL OFL 1.1 licence travels with the font package, and the CSS stays small); `--font-sans` falls back to the system UI fonts if you skip the import. Tokens are plain custom properties on `:root`, so a consumer can override any of them (start with `--tint`).

Playback components (`SeekBar`, `WavyProgress`, `TransportButtons`, `MiniPlayer`, `SkipButton`, `SpeedControl`, `SleepTimerControl`) are stateless: pass `position` and `duration` in milliseconds and handlers, and keep playback state in the app.

### From source, inside this workspace

The package exports an `@joepittsy/source` condition, so an app in this workspace can use it with no build, under a package-specific condition (not the generic `source`, which an external consumer might enable, and which the published tarball cannot satisfy, as it ships `dist` only). In the app's Vite config:

```ts
resolve: { conditions: ['@joepittsy/source'] }
```

Then `@joepittsy/ui` resolves to `src/index.ts` and `@joepittsy/ui/styles.css` to `src/styles/index.css`.
