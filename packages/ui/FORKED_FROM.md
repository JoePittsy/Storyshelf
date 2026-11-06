# Forked from TrueTunes

This package began as the design layer of TrueTunes, by TrueNorth IT, extracted into a standalone design system.

| | |
|---|---|
| Source repository | https://github.com/TrueNorthIT/TrueTunes |
| Source commit | `781d5297b9dc09da59e83909934b05b663bd5047` |
| Fork date | 2026-11-06 |
| Relationship | Hard fork. There is no upstream to merge from; the two histories are now independent. |

This is a hard fork, used with the explicit permission of the owner. In the source it lived inside the Electron app's `renderer/` (tokens in `renderer/src/styles/`, components in `renderer/src/components/common/` and `components/stats/`). Here it has no application coupling: no Electron bridge, no global stores, no image cache, no router or query client.

## Ported unchanged

Moved into `src/components/<Name>/` with only import paths, comments and story copy changed.

| Component | Notes |
|---|---|
| AddButton | Default label is now `Add {title}` where used by rows and cards |
| PillButton | |
| Dialog | |
| Toast, ToastProvider, useToast | CSS moved beside it; fixed to the bottom right corner |
| InfoTip | Stories now use InfoTip directly |
| Carousel | |
| SectionCard, SeeAll | |
| HeroBand | |
| EqBars | |
| `stats/` BarList, ChartTooltip, Heatmap, ramp | |
| `lib/wavePath.ts` | |
| `styles/global.css`, `styles/depth.css` | See "Tokens and styles" below |
| `hooks/useDominantColor.ts` | The `setGlobal` option (which wrote `--panel-color` onto the document) was removed; reads cross-origin images with `crossOrigin = 'anonymous'` and leaves the result null if the canvas is tainted |

## Rewired

| Component | What changed |
|---|---|
| TransportButtons | Was bound to `getActiveProvider()`. Now takes `playing`, `onPlayPause`, `onPrevious`, `onNext`, `disabled`, `previousDisabled`, `nextDisabled`, `filled`. Has its own CSS; sized in `em`. |
| SeekBar | Was bound to the provider and a playback store. Now takes `position`, `duration` (ms) and `onSeek`. Click and keyboard scrubbing kept (arrows, Home, End). Has its own CSS. `LiveSeekBar` dropped. |
| PlaybackTime, PlaybackRemaining | Take values (`ms`; `position`, `duration`) rather than reading a store. |
| WavyProgress | Takes `position` and `duration` instead of `progressPct`. `LiveWavyProgress` dropped. |
| ArtCard, ImageTile, ItemRow / RowThumb, PersonCard, PersonChip, UserAvatar, TopResultCard, ChartRow, Artwork | `useImage` and the image cache (which fell back to Electron IPC) replaced by a plain `<img loading="lazy">` with a placeholder on error (`hooks/useImageFallback.ts`). `withArtworkSize` (the YouTube URL rewrite) dropped. |
| UserAvatar | Champion ring, crown and `ChampionContext` removed. Now has a default 2em circle (zero specificity) so it works without a caller's class. |
| TopResultCard | The grey-silhouette pixel check and `data-search-stop` removed. Heading is a `heading` prop (default "Top result"). |
| Artwork | Placeholder is a `placeholder` prop (default a neutral glyph, was a musical note); lazy by default. |
| `fmtTime` | Lifted from `lib/itemHelpers.ts` into `src/lib/fmtTime.ts`. |

## Renamed

| Was | Now |
|---|---|
| TrackRow | ItemRow |
| TrackLinks (file) | ItemLinks |
| ArtistLinks `{ artist, onOpenArtist }` | PeopleLinks `{ people, onOpenPerson }` |
| TitleButton default label `"{title}, open album"` | `"{title}, open"` |
| ItemRow and ChartRow prop `artists` | `credit` |
| ChartHead default labels `# Title Artist Plays` | `# Title Credit Count` |
| rows.module.css classes `.track`, `.artist`, `.chartArtist` | `.item`, `.credit`, `.chartCredit` |
| Story titles `Player/*` | `Playback/*` |
| ArtCard story `WithArtistPhoto` | `WithPhoto` |
| ImageTile story `Artist` | `Circular` |

## Dropped

| Item | Why |
|---|---|
| ContextMenu, CreatePlaylistDialog | App behaviour (queue and playlist actions) |
| QueuerChip, OfficeChip, FanBubbles, ExplicitBadge, StatsArtistTile, PersonName, PickInfoTip | Music or office specific |
| StatsPage | Not a pure frame: its padding assumes the app's nav and player heights (`--nav-h`, `--player-h`) |
| ErrorBoundary | Not pure: reports to the Electron telemetry bridge and uses app copy |
| Everything under `queue/`, `polls/`, `artist/`, `album/`, `queuedle/`, `search/`, `musicStats/`, `skinny/` | App features |
| PlayerBar, MiniPlayer, AmbientBackdrop, TopNav, WindowControls, Splash, ChangelogDialog, FeedbackDialog, ChampionProvider | App shell |
| Every `*.page.stories.tsx`, the mock backend, `window.sonos` fake, `lib/imageCache`, `useImage`, `lib/artworkUrl`, `lib/champion`, `lib/photoPlaceholder`, `hooks/playbackPosition` | App wiring |

## Tokens and styles

| Item | Change |
|---|---|
| Removed tokens | `--champion`, `--champion-text`, `--fs-lyric`, `--fs-lyric-plain`, `--fs-stat`, `--fs-display-profile`, `--fs-avatar-initial`, `--fs-rename`, `--nav-h`, `--player-h` |
| Added token | `--font-sans` (the font stack, previously set on `body`) |
| Removed from the package (app shell) | Global `user-select: none`, `body` 100vh and `overflow: hidden`, `#root` layout, `html[data-mini]` rules, webkit scrollbar styling |
| Reset | `*` reset (box-sizing, margin, padding) now at zero specificity via `:where()` so a consumer's rules win |
| `.page-scale` | Now also sets `font-family`, text colour and font smoothing, so the package no longer styles `body` |
| Palette | Unchanged from TrueTunes |

## Attribution

| Dependency | Licence |
|---|---|
| Manrope, via `@fontsource-variable/manrope` | SIL Open Font Licence 1.1 |
| `lucide-react` | ISC |

## Licence

This package is derived from TrueTunes by TrueNorth IT. Joe Pitts wrote the TrueTunes design system and has TrueNorth IT's explicit permission to fork it and publish this derivative under the licence below. The package as a whole, including the changes listed above, is Copyright (c) 2026 Joe Pitts and licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`); see [`LICENSE`](./LICENSE).
