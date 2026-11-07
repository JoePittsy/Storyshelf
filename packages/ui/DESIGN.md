---
name: Storyshelf UI
description: A dark, quiet design system for content-led interfaces. Calm walls; the artwork and the people carry the colour.
colors:
  label: "rgba(246, 247, 255, 0.93)"
  tint: "rgb(150, 158, 255)"
  after-hours-navy: "#12131f"
  raised-navy: "#1b1d2e"
  wall: "rgba(150, 158, 255, 0.06)"
  wall-lit: "rgba(150, 158, 255, 0.085)"
  tint-fill: "rgba(150, 158, 255, 0.09)"
  tint-chip: "rgba(150, 158, 255, 0.16)"
  separator: "rgba(150, 158, 255, 0.1)"
  border: "rgba(150, 158, 255, 0.13)"
  border-strong: "rgba(150, 158, 255, 0.24)"
  frosted-navy: "rgba(22, 23, 38, 0.62)"
  label-secondary: "rgba(222, 226, 250, 0.62)"
  label-tertiary: "rgba(224, 228, 252, 0.64)"
  title-rest: "rgba(255, 255, 255, 0.84)"
  on-art: "#ffffff"
  on-art-secondary: "rgba(255, 255, 255, 0.75)"
  caption-scrim: "rgba(0, 0, 0, 0.74)"
  danger: "rgb(248, 113, 113)"
typography:
  display:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "96px" # max of clamp(44px, 6cqw, 96px); the lint format has no fluid sizes
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "2.2em"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title-feature:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.9em"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.6em"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title-caption:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.5em"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "1.07em"
    fontWeight: 500
  body-prose:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "0.95em"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Manrope Variable, -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "0.93em"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  row: "0.65em"
  thumb: "0.6em"
  tile: "0.9em"
  art-card: "1em"
  card: "1.2em"
  pill: "2em"
  shell: "22px"
  round: "9999px" # a circle: --r-round is 50%
spacing:
  page-base: "clamp(14px, calc(0.45vw + 8.2px), 16px)"
  gutter: "28px"
  band: "1.4em"
  card-pad: "1.5em"
  featured-pad: "1.7em"
  head-gap: "1.1em"
  row-gap: "0.9em"
  row-pad: "0.45em 0.6em"
components:
  button-pill:
    backgroundColor: "{colors.label}"
    textColor: "{colors.after-hours-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-ghost:
    backgroundColor: "rgba(150, 158, 255, 0.12)"
    textColor: "{colors.label}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-ghost-hover:
    backgroundColor: "rgba(150, 158, 255, 0.22)"
  button-pill-danger:
    backgroundColor: "rgba(248, 113, 113, 0.16)"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.55em 1.1em"
  button-pill-danger-hover:
    backgroundColor: "rgba(248, 113, 113, 0.28)"
  button-add-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.label-tertiary}"
    rounded: "{rounded.round}"
    size: "2.2em"
  button-add-quiet-hover:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.label}"
  card-section:
    backgroundColor: "{colors.wall}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  card-featured:
    backgroundColor: "{colors.wall-lit}"
    rounded: "{rounded.card}"
    padding: "{spacing.featured-pad}"
  card-art:
    backgroundColor: "{colors.raised-navy}"
    textColor: "{colors.on-art}"
    rounded: "{rounded.art-card}"
  item-row:
    backgroundColor: "transparent"
    textColor: "{colors.title-rest}"
    rounded: "{rounded.row}"
    padding: "{spacing.row-pad}"
  item-row-hover:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.on-art}"
  chip-person:
    backgroundColor: "{colors.tint-chip}"
    textColor: "{colors.label-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.7em 0.2em 0.2em"
  dialog:
    backgroundColor: "{colors.raised-navy}"
    textColor: "{colors.label}"
    rounded: "{rounded.card}"
    width: "36em"
  dialog-input:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.label}"
    rounded: "{rounded.row}"
    padding: "0.65em 0.85em"
  floating-pill:
    backgroundColor: "{colors.frosted-navy}"
    textColor: "{colors.label}"
    rounded: "{rounded.shell}"
    height: "44px"
---


# Design System: Storyshelf UI

## Overview

**Creative North Star: "After-Hours Gallery"**

The system is a gallery after closing time: dark, quiet walls with covers and portraits hung like prints, each with its own caption. The walls are a deep, desaturated navy. Content sits on soft tonal panels a few percent lighter than the ground, never framed or outlined. Colour comes from the work on the walls: the dominant colour of a hero image washes into the card that holds it. Anything that floats (toasts, tooltips, bars) is frosted glass over whatever is behind it.

The benchmark is a calm media app played straight: no themed or novelty worlds, and the character lives in the content and the people, not in decoration. Type is one family, Manrope, set in sentence case with tight negative tracking on large sizes. Surfaces size everything in `em` from one fluid base, so a page scales from a laptop to an ultrawide without breakpoints jumping. Density is relaxed: generous rows, large artwork, nothing cramped.

The components in this package are the way in: build new surfaces from them rather than from one page's local styles. A consumer retunes the system by overriding the custom properties on `:root`; nothing in the package depends on an app.

**Key Characteristics:**
- One navy tint. Every tonal surface, fill and hairline is `--tint` at a low alpha.
- Borderless tonal cards on a tinted ground; artwork is the only thing that casts a shadow inside the content area.
- Full-bleed image cards with a bottom scrim and a white caption, like a print and its label.
- Accent colour is sampled from the artwork at runtime, never fixed.
- Frosted materials for floating surfaces, with solid fallbacks under reduced transparency.
- Fluid `em` scaling from one base size; Manrope throughout.

## Colors

A near-monochrome navy room whose only saturated colour is borrowed, at runtime, from the artwork on its walls.

### Primary
- **Gallery Light** (`label`): the primary action colour. The pill button inverts the room, with a light label as its fill and After-Hours Navy text. It's also the default text colour. There is no fixed brand hue.

### Neutral
- **Periwinkle Tint** (`tint`): never painted at full strength. It's the source triplet (`--tint: 150, 158, 255`) that every tonal token is mixed from at 6–24% alpha. On a #12131f ground it reads as a cool navy lift, not as purple.
- **After-Hours Navy** (`after-hours-navy`): the page ground (`--bg`). It's also the text colour on the inverted pill button.
- **Raised Navy** (`raised-navy`): the solid placeholder behind every artwork box while it loads, the Dialog surface, and the reduced-transparency fallback for the frosted materials.
- **Wall** (`wall`): the resting fill of section cards and person cards (`--surface`).
- **Lit Wall** (`wall-lit`): featured cards and hero bands (`--surface-hi`).
- **Tint Fill** (`tint-fill`): row hover, quiet icon-button hover, the open menu item and the dialog field (`--bg-2` / `--row-hover`).
- **Tint Chip** (`tint-chip`): chips.
- **Separator** (`separator`): the 1px edge on floating surfaces. It isn't used on content cards.
- **Border / Strong Border** (`border`, `border-strong`): the one control stroke, on a field, at rest and on hover; on focus the ring covers it.
- **Frosted Navy** (`frosted-navy`): floating surfaces (toasts, tooltips, floating bars), the material token `--material-bg`, always paired with `--material-filter` (`blur(30px) saturate(1.8)`).
- **Label scale** (`label`, `label-secondary`, `label-tertiary`): primary text, secondary meta, tertiary meta and subtitles. `label-tertiary` (`--text-3`) carries real subtitles on cards and washes, so it is held at 4.5:1 or better there.
- **Title at rest** (`title-rest`): item and chart titles at rest. They brighten to On-Art White on row or tile hover.
- **On-Art White / On-Art Secondary** (`on-art`, `on-art-secondary`): text over imagery, always on a scrim, with a soft black text shadow on the larger lines.
- **Caption Scrim** (`caption-scrim`): the darkest stop of the image-card scrim (`--scrim-art`). Tiles and heroes that need more weight under the text use the deeper, bottom-only `--scrim-deep` (0.86 → 0.4 → 0 by 68%).

### Status
- **Danger** (`danger`, `--danger: 248, 113, 113`): destructive actions (Clear, Delete) and errors. A triplet like `--tint`, used tonally (a 0.16 fill under full-strength text), never as a slab.
- **Success** (`--success: 74, 222, 128`): the success toast's status dot and tonal "ready" actions (a 0.16 fill under full-strength green text). A triplet, never a slab.
- **Attention** (`--attention: 251, 146, 60`): something waiting for the person, as a tonal button (0.16 fill under full-strength orange text). A triplet, used sparingly.
- **Danger solid** (`--danger-solid: 220, 50, 50`): the one solid slab, an error banner, because white text needs more contrast than tonal Danger gives.

### Runtime accent (artwork-derived)
The accent isn't a token. `useDominantColor` samples an image and returns an `r, g, b` triplet, which a surface passes in as `--wash` (SectionCard and HeroBand), or uses inline as a gradient on a person-card header. Washes fall back to the tint triplet when no colour is available.

Generated colours keep the same restraint: avatars are hashed onto hues 0–250° and 330–360°, skipping the 250–330° violets, at 20–30% lightness so a white initial holds 4.5:1.

### Named Rules
**The One Tint Rule.** Every tonal surface, fill, separator and border is `rgba(var(--tint), α)`. To retune the room, change `--tint`; never introduce a second hue for chrome.

**The Artwork Carries Colour Rule.** Saturated colour enters only from artwork: the `--wash` radial on featured cards and heroes, the person-header gradient. Chrome stays navy and white. Danger, success and attention are status, not decoration, and their fills are always tonal.

**The Quiet Wall Rule.** Tint stays subtle and desaturated. Surfaces sit 6–9% tint over the ground. A wash peaks at 0.3 alpha, with stacked layers counted together, and fades to transparent by about 65%. No purple, no neon, no glow.

**The No Violet Rule.** Generated colours (avatars, placeholder art) never land on 250–330°. Fold the hue past that band rather than clamping to its edge.

## Typography

**Display Font:** Manrope Variable (with -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif), as `--font-sans`
**Body Font:** Manrope Variable (same stack)

**Character:** One geometric-humanist sans used across the whole hierarchy. Weight and negative tracking do the work that a second family would: 600 for titles, 800 only for the single name a hero is about.

### Hierarchy
Sizes are in `em` from the page base `clamp(14px, calc(0.45vw + 8.2px), 16px)` (14px at 1280 wide, 16px from about 1730px up), applied by the `.page-scale` class. Display sizes follow the page container (`cqw`), not the viewport.
- **Display** (`--fs-display`, 800, `clamp(44px, 6cqw, 96px)`, 1.04, -0.03em): the one name a hero is about, clamped to 2 lines. A long credit steps down to `clamp(30px, 3.4cqw, 56px)` (`--fs-display-sm`). Nothing else.
- **Headline** (`--fs-headline`, 600, 2.2em, 1.15, -0.01em): a page greeting.
- **Title, feature** (`--fs-title-feature`, 600, 1.9em, 1.15, -0.02em): HeroBand titles (2 lines) and the TopResultCard title (3 lines).
- **Title** (`--fs-title`, 600, 1.6em, 1.2, -0.015em): section and shelf titles. Dialog titles sit at 1.3em (`--fs-title-dialog`), balanced.
- **Title, caption** (`--fs-title-caption`, 600, 1.5em; 1.15em on medium cards, `--fs-title-card`; -0.01em): the title line under an image-card scrim.
- **Play, extra large** (`--fs-play-xl`, 2.2em): sizes the one big Play circle of a phone player (the `xl` transport), about 4.8em of body text; its glyph scales with it.
- **Body** (`--fs-body`, 500 title / 400 credit, 1.07em): item and chart rows, hero sub-lines.
- **Body, prose** (`--fs-prose`, 400, 0.95em, 1.55, max 100ch): running text and notes. A SectionCard's subtitle holds to the same measure (`max-width: 100ch`). Dialog notes cap at 62ch.
- **Label** (`--fs-label`, 500, 0.93em): chips, small buttons and secondary lines. The smaller step is `--fs-small`, `max(13px, 0.86em)`.
- **Fixed-px surfaces** (compact panels that don't scale with the page): `--fs-px` 13px for meta, `--fs-px-lg` 14px for row text, `--fs-px-title` 16px for titles.

Every font size in the CSS is one of these tokens, enforced by Stylelint. Glyph and icon sizes have tokens too: `--fs-glyph-sm` 2em, `--fs-glyph-md` 2.4em, `--fs-glyph` 3em and `--fs-glyph-lg` 4em (empty-art glyphs, rank numerals), `--fs-icon` 18px and `--fs-icon-sm` 16px (icon glyphs). Car mode has its own base, `--fs-car` (`clamp(17px, 4vmin, 28px)`), which follows the viewport's smaller side so a phone on its side and a desktop window both get glanceable type; everything in the CarPlayer is sized in em from it.

### Named Rules
**The Sentence Case Rule.** Titles, captions, buttons and chips are sentence case. Hierarchy comes from size, weight 600 and negative tracking, not from capitals or a second face. Server strings in title case are sentence-cased in CSS.

**The 13px Floor Rule.** No content text renders below 13px at any window width. 0.93em is the smallest plain `em` step that holds 13px at the 14px base; anything smaller is written `max(13px, Xem)`. Tabular numerals (`font-variant-numeric: tabular-nums`) are used for ranks, counts, facts and times.

## Layout

Put `.page-scale` on a page root and size everything inside it in `em`. Page roots that hold responsive components are CSS containers (`container-type: inline-size`), and respond with `@container` queries at 1100px and 700px rather than viewport breakpoints. The package sets no page chrome: the consumer owns the body background (`var(--bg)`), scrolling and the app shell.

- **Bands:** 1.4em between every band and column, horizontally and vertically, so the rhythm is one value.
- **Grids:** asymmetric fr grids, stacking to one column below 1100px.
- **Auto-fill grids** for repeated tiles: `minmax(8.5em, 1fr)` for tiles; people use `minmax(min(100%, 22em), 1fr)`.
- **Inside cards:** 1.1em under a section head, 0.9em between row items, row padding 0.45em × 0.6em.
- **Heroes:** a HeroBand is 16em art (12.5em under 1100px, stacked under 700px) beside a feature title, on Lit Wall with the wash.
- **Shelves:** a Carousel scrolls a row of cards of `--card-size`, with arrows only when it overflows. Untitled, it has no header row until it overflows, so it can sit straight under a SectionCard's title.

## Elevation & Depth

Depth comes from tonal layers, not from shadows on content. The navy ground carries tonal cards a few percent lighter. Frosted materials and modals float above everything. Content cards are flat. Shadows appear only on artwork and on floating surfaces.

### Shadow Vocabulary
- **Art rest** (`--art-shadow`: `0 2px 8px rgba(0, 0, 0, 0.35)`): shelf artwork at rest, paired with the inner keyline `inset 0 0 0 1px rgba(255,255,255,.06)` (`--art-keyline`) drawn by the art box's `::after`.
- **Art lifted** (`--art-lift-shadow`: `0 8px 18px rgba(0, 0, 0, 0.4)`): tiles on hover or focus, with a 2px rise.
- **Hero art** (`--hero-shadow`: `0 10px 28px rgba(0, 0, 0, 0.35)`; hover `--hero-lift-shadow`: `0 14px 34px rgba(0,0,0,.45)`): HeroBand artwork and other detail-page prints.
- **Floating** (`--float-shadow`: `0 8px 32px rgba(0, 0, 0, 0.5)` plus the `--material-edge` highlight): floating bars, dropdowns, menus, toasts, tooltips and the Dialog. The Dialog's backdrop is `--overlay` (`rgba(0,0,0,.55)`), the same dim used over art and on dark corner buttons. White text over art takes `--text-shadow` (`0 1px 6px`) or, on larger lines, `--text-shadow-lg` (`0 1px 12px`); an avatar's hover ring is `--face-ring`.

Black and white appear in the CSS only as the alpha tokens declared in `global.css`: `--overlay`, `--overlay-strong`, `--well`, `--glass`, `--glass-hi`, `--glass-faint` and `--track`. Stylelint (`pnpm lint:css`, config in `stylelint.config.mjs`) fails on a raw colour, radius, font size or shadow colour anywhere else.

### Named Rules
**The Shadows Belong to Prints Rule.** Inside the content area only artwork casts a shadow. Cards, rows and chips are flat tonal fills.

**The Frosted Material Rule.** Anything floating over content uses the material tokens (`--material-bg` + `--material-filter: blur(30px) saturate(1.8)`). Under `prefers-reduced-transparency` they fall back to solid Raised Navy. Don't hand-roll a second glass recipe.

## Shapes

Generously rounded, never sharp. Radii scale with the type in `em`: cards and dialogs 1.2em (`--r-card`), image cards 1em (`--r-art-card`), tiles, prints and menus 0.9em (`--r-tile`), artwork 0.7em (`--r-art`), rows and fields 0.65em (`--r-row`), row thumbnails 0.6em (`--r-thumb`), skeleton lines and small chips 0.4em (`--r-xs`). Fixed-px surfaces use the global scale (`--r-sm` 6px, `--r-md` 10px, `--r-lg` 16px). Floating pills are 22px (`--r-shell`, half a 44px height). Buttons and chips that carry a label are full pills (`--r-pill`, 2em), as are thin bars. Icon buttons, avatars and portraits are circles (`--r-round`, 50%). Every `border-radius` in the CSS is one of these. Imagery is always clipped to its container's radius with `object-fit: cover`. Large photo cards set `object-position: center 25%` to keep faces in frame.

**The No-Outline Rule.** Content cards, rows, chips, tiles and fields have no border. Separation comes from a tonal step (Wall on navy), not from a line. The only 1px strokes are a floating surface's separator edge, the artwork's inner keyline, and a search box.

## Components

### Buttons
- **Pill (PillButton):** sentence case, weight 600 at 0.92em, padding 0.55em × 1.1em on a full pill. *Primary* is the room inverted (Gallery Light fill, After-Hours Navy text, hover to 0.78 opacity), one per view. *Ghost* is tonal (tint 0.12, hover 0.22) for secondary actions. *Danger* is tonal red (0.16, hover 0.28) for destructive ones. Disabled drops to 0.4.
- **Add (AddButton):** the one + button, borderless, and its click never bubbles. *Quiet* is a 2.2em circle in tertiary label colour, revealed when its row is hovered or focused within, filling with Tint Fill on hover. *Art* is a 2.6em translucent white circle on image cards. *Corner* is a dark circle on tile corners, revealed on hover. The parent owns position and reveal.
- **More (MoreMenu):** a surface's secondary actions behind one quiet 44px circle (an ellipsis on the ghost tint, 0.12, hover 0.22), beside the primary pill. It opens a native popover on the frosted material, in the top layer and anchored under the button (flipping to stay on screen), of 44px rows in label weight 600; a place- or data-losing row is Danger text with a tonal red hover. A disclosure, not an ARIA menu: the rows are plain buttons, Esc and an outside click close it, and choosing a row closes it first. Pair anything it changes with an Undo toast rather than a confirm. Its *quiet* variant has no fill until hovered and sits in tertiary label colour, for a tile's caption (ImageTile `menu`).
- **Text link ("See all", TitleButton, PeopleLinks):** no chrome. Secondary label colour, which turns full label with an underline on hover or focus.
- **Transport (TransportButtons):** previous, play-pause and next, stateless: the caller passes `playing` and the handlers. Previous and next are quiet; play-pause is the inverted circle.
- **Focus (all):** one global ring, `outline: 2px solid var(--text-2); outline-offset: 2px`. Over art that may be pale (TopResultCard) the ring sits inside, in white with a black edge. A stroked field (TextField, SearchField, Select) draws the same ring at `outline-offset: -1px`, over its own stroke, so focus is one outline, never two.

### Chips and faces
- **Person chip (PersonChip):** a toggle for choosing people. Tint Chip fill, a full pill, a round avatar at the leading edge, tonal fill when selected, and an optional series-colour dot. Pair colour with the name, never alone.
- **Chip (Chip):** a pill link to a person, series or page. Tint Chip fill, an optional round avatar and a muted count after the name; hover steps to the row-hover tint.
- **Filter chip (FilterChip):** an applied filter. A full pill in the selected tonal fill (tint 0.16) with the label and a round remove button at the trailing edge; the button's name is "Remove filter: {label}".
- **Person link (PersonLink):** a person as a link. A tonal card (1em radius, no border) with a 3em round avatar, the name and a muted caption; hover steps to the raised surface. It fills its container, so a grid decides single column or cards.
- **Tabs (Tabs):** navigation links under the top bar. Secondary label colour; the current tab is full label colour with a 2px underline and `aria-current="page"`. A hairline runs beneath, and the row scrolls sideways when it can't fit, under an edge fade. A `separated` destination (Settings) sits after a short divider, pinned outside the scrolling part, so the narrowest phone never scrolls it out of reach.
- **Avatar (UserAvatar):** a round photo, or the person's initial on a per-name gradient (also when the photo fails to load). It is decorative: the name always sits beside it. Without a class it is a 2em circle; a caller's class sets its own size.

### Cards / Containers
- **Corner Style:** 1.2em (section and featured cards), 1em (person cards, image cards).
- **Background:** Wall at rest, Lit Wall for featured. The featured cards add a radial `--wash` from the top-left corner (120% 110% at 15% 0%, 0.26 alpha, fading by 62%; HeroBand 120% 150% at 0% 0%, 0.3, by 65%).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none.
- **Internal Padding:** 1.5em (section), 1.7em (featured), 1.4em (HeroBand), 0.9em (person).
- **SectionCard** is the shared card (`featured` for the lit wall and wash), labelled by its title, with an optional **SeeAll** link. **PersonCard** is avatar, name and caption, with the photo's colour washed across the header (`100deg`, 0.3, gone by 75%).
- **HeroBand:** a detail page's header: hero art (12.5em to 19em, 22% of the container) beside a feature title and vertically centred against it, on Lit Wall with the wash, with an optional corner chip. Below 700px of container the band stacks, with the art centred.
- **DetailList:** label and value pairs as a `<dl>`: a small tertiary label over a body-size value, stacked, so it fits a narrow side column. It has no surface of its own; put it on a card.

### Image card (signature)
A print with its label (ArtCard). The artwork fills the card edge to edge (`object-fit: cover`). A two-part scrim, `rgba(0,0,0,.4)` fading over the top 22% and `rgba(0,0,0,.74) → .26 → 0` up from the bottom by 70%, keeps a sentence-case top-left caption and a bottom-left title and credit legible in white. The whole card is one button. Links and the add button sit above it. Hover or focus-within scales the image to 1.03 and dims it to `brightness(.88)` over 0.15s. A second image (a portrait) fades in over the cover when it arrives. An image that fails to load drops its layer and leaves Raised Navy behind the caption.

**Top result (TopResultCard)** is the same print at feature scale. The art fills a 1.2em card (at least 20em high, 4:3 when stacked), and the heading, title (3 lines), meta and children sit bottom left on a scrim of their own (0.82 → 0 up the text block), so the text holds on pale covers. With no art it falls back to Lit Wall and the tint wash.

### Item and chart rows
Borderless rows (ItemRow, ChartRow) with a 0.65em radius and 3.2em rounded thumbnails. The title is at Title-at-rest white (500) and the credit in tertiary label on the same line. Hover or focus-within fills the row with Tint Fill, brightens the title to white and reveals the quiet add button. Chart rows are a fixed grid (rank · title · credit · count · add) with zero-padded tabular ranks and counts, and optional ChartHead column labels on the same grid.

**ActionRow** is a row you can open that also carries its own actions (rename, delete), such as a bookmark: the open button holds the title (it wraps rather than truncates), a tertiary detail line and a secondary tabular figure, and each action is a separate 44px quiet circle after it, always visible so a phone can reach it. The whole row takes Tint Fill on hover or focus-within; Delete turns tonal Danger on hover. Each action's name includes the row's title ("Delete Chapter 3").

### Tiles
Square art (ImageTile, 0.7–0.9em radius, or a circle for people) over a caption: the title in Title-at-rest, clamped to two lines (the full text is its `title` attribute), then the sub in tertiary label on one line. The tile's accessible name is one `aria-label`, "Title, Author". Hover or focus rises the tile 2px and gives the art the Art-lifted shadow. With `href` the tile is a real link (a plain click still calls `onOpen`), and `overlay` draws over the art, e.g. a ProgressBar.

### Top bar
TopBar is a sticky header on the frosted material with start, centre and end slots; it pads its top by the safe-area inset and has no tokens of its own.

### Playback
Stateless pieces (SeekBar, WavyProgress and EqBars first, then the controls below); the app owns playback and passes values in.
- **SeekBar:** a slider (`position`, `duration`, `onSeek`). A tall hit area around a thin `--track` line, which grows on hover; click to scrub, arrow keys move 5 seconds, Home and End jump. With no duration it is disabled. Optional `markers` (`{ at, label }`, ms) draw 1px decorative ticks for chapter starts; they flip colour against the fill and never take the pointer. Hovering (or dragging a finger across) the bar shows a frosted preview of the time and the marker it falls in, pinned inside the bar ends; with two or more markers the hovered chapter's segment (marker to next marker) is also drawn white and lifted above the bar (`aria-hidden`, no pointer events; not on `readOnly`); the preview is `aria-hidden`, and the marker at the playhead is spoken in `aria-valuetext`. **PlaybackTime** and **PlaybackRemaining** print the times in tabular numerals.
- **WavyProgress:** the played part is a 0.32em `--title-rest` stroke shaped as a sine wave, 0.16em amplitude and 2em wavelength, travelling slowly forward, its height ramping up from flat over the first wavelength so a just-started item shows a short flat line; a 0.35em gap; then the flat 0.32em `--track`. Paused, the wave eases to a straight line over 0.6s and stops; under reduced motion it is a still, flat line.
- **EqBars:** three bars on the compositor meaning "this is the current item". Still when paused and under reduced motion.
- **SkipButton:** a circular arrow with the seconds inside it, in two sizes (2.6em, 3.4em), quiet like the transport buttons. Named "Back 30 seconds" or "Forward 30 seconds".
- **SpeedControl and SleepTimerControl:** a quiet pill trigger ("1.3×", or a moon and "Sleep", "12:30", "End of chapter") that opens a native popover on the frosted material. The popover is in the top layer, so nothing clips it, closes on Esc and outside click, and is placed with CSS anchor positioning, flipping to stay on screen. Speed is a range slider plus preset pills; sleep is a list of options ending in "Off". Remaining time reads m:ss, or h:mm:ss from an hour.
- **MiniPlayer:** the frosted material in a bottom slot, padded by the safe-area inset. A 0.2em progress line runs along its top edge; art and title are one button ("Open player"), then skip back and the inverted play-pause circle, which shows a spinner (and `aria-busy`) while loading. Wide, it adds skip forward, the time and Expand; chapter buttons, the progress modes, speed, sleep and a chapters button are optional zones that appear only when their props are given. Storyshelf passes none of them, so its bar stays slim and those controls live on Now Playing.
- **UpNextCard:** what to play once the current item is done, offered, never auto-played. One row: small art, a sentence-case heading ("Up next", or "Next in <series>", which also names the region), the title (a link, two lines) and its place ("Book 2 of Sherlock Holmes"), then the inverted Play action and an optional 44px close. Under 28em of container the action is a 44px round Play and the words wrap; wider, it is a labelled pill ("Start", "Continue"). The *card* variant is Lit Wall with the art's `--wash`; the *bar* variant is an opaque Raised Navy strip with the top hairline and one line each of title and caption, for sitting on the MiniPlayer, its content in the app column.
- **IconButton:** the AirPlayButton's twin for other header actions: a quiet 44px circle with a named glyph (`car`), no fill until hovered, the label as its name and tooltip, with an optional keyboard shortcut in both.
- **CarPlayer:** car mode, a full-screen, one-handed player to glance at. The chapter (title size, two lines), the time left in it in big tabular numerals (`--fs-glyph-lg`) with "left in chapter" after it, and a thick 0.75em progress bar; then the chapter buttons as two wide pills at the row's ends, and skip back, Play and skip forward. Every target is at least 64px, sized from the viewport's smaller side (`vmin`); Play is 112px and up, inverted as everywhere else, and neighbours sit 1.5 gaps apart so a missed tap lands on nothing. Close is a 64px circle top left; a chapter jump's Undo is a large tonal pill opposite it while offered. White text on the navy ground, tonal tint fills for the quiet buttons, no artwork. In landscape it becomes two columns: words left, controls right. Stateless, padded by the safe-area insets; the app keeps the screen on.
- **AirPlayButton:** a quiet 44px circle with the AirPlay glyph, named "AirPlay", shown only while the browser reports a target. While playback is on an AirPlay device it takes Tint Chip and full label colour, and its description says so.
- **OfferButton:** a small one-tap offer made in passing ("Go back to where the timer began, 41:10"): the ghost pill's tint (0.12, hover 0.22) at label size and weight 600, an optional glyph in secondary label (a moon for the sleep timer, a monitor and phone for another device's place), a 44px minimum height, and words that wrap rather than truncate; an optional short form replaces them under 22em of screen, so a small phone keeps it to one line. *Inline* sits on a page; *bar* puts it on the same opaque Raised Navy strip with a top hairline as the UpNextCard bar, to sit on the MiniPlayer. The app decides when it shows and goes.
- **Sheet:** the Dialog surface as a bottom sheet under 40em wide (full width, rounded on top, safe-area padding) and a centred panel above that. It is a native `<dialog>`, so Esc and a backdrop click close it.
- **GrabSheet:** the shell of a full-height phone sheet, as Now Playing uses: a grab handle and a 44px chevron-down button (named by `closeLabel`) along the top, the content below. Pulled down from the handle or any non-interactive part it follows the finger with `transform` and dismisses past a quarter of its height (80 to 160px) or on a flick (0.5px/ms, at least 24px); sooner and it springs back. A swipe that starts on a slider, button or link is theirs. Reduced motion: no dragging, the chevron still works.
- **IconTray:** one tonal container (Wall) of evenly spread icon buttons (speed, sleep, chapters, add bookmark, bookmarks, history, settings), all with the same quiet treatment and 48px height; labels are for assistive tech, except the values (speed "1.0×", a running sleep time).
- **StepperRow:** a ‹ previous button, the current item's title (one line, truncated; it opens the list) and a › next button, 44px targets. The count ("7 of 28") is shown only when the title does not already name the place.
- **SeekBar thumb (`thumb`):** an opt-in 1.15em white circle on the playhead for phone Now Playing; it grows to 1.4x under a finger (transform only) and the fill follows the finger while dragging. Ticks and the 32px hit area are unchanged.
- **SegmentedControl underline:** `variant="underline"` draws the same radio group as plain text with a 2px line under the chosen option (the line scales in): the compact Whole book / This chapter / Sleep switch.

### Dialog
One modal (Dialog): a native `<dialog>` opened with `showModal()`, so the page behind is inert, Tab stays inside, Esc closes it and focus returns to the opener. Raised Navy, 1.2em radius, the Floating shadow, widths of 26, 36 or 64em. The sentence-case title names the dialog, beside a 2.2em round close button. The action row is right-aligned: secondary actions first, the primary or danger pill last. An outside click closes it, except in a form dialog, so a stray click can't lose typed text.

### Toast and InfoTip
**Toast** is the frosted material with a status dot and an optional action, such as Undo (a 44px target). It sits above the bottom player and any other pinned bar by offsets the app publishes on the root, pauses its timer while hovered or focused, and on closing returns focus to the control that raised it if focus would otherwise fall to the page. **InfoTip** is a small info button whose tooltip is portalled to the page, flips to stay on screen and closes on Escape.

### Inputs / Fields
- **Dialog field:** a borderless tonal field (Tint Fill, hover tint 0.12, 0.65em radius, padding 0.65em × 0.85em) under a secondary-label label. Focus shows the global ring. Placeholders are tertiary label; errors are Danger text.
- **Shelf search:** the Carousel's filter is a 26px pill with a `border` stroke on a `rgba(255,255,255,.05)` fill. Focus steps the stroke to `border-strong`.

### Charts
BarList, ColumnChart, Heatmap and ChartTooltip draw data on the dark ground. ColumnChart is one series over an ordered scale (months): thin columns (at most 1.6em) in `--series-1` with 4px-ish rounded tops on a hairline baseline, 2px apart, a value on the tallest only, a hover readout per column, and the figures as a table behind a "Show as a table" disclosure, its text alternative. A zero draws nothing; labels shorten to one letter under 30em of container. Series use `--series-1` to `--series-8` (the first three are the colour-blind-safe trio); heatmaps use the sequential ramp between `--ramp-lo` and `--ramp-hi`. Highlighted rows are bold as well as coloured.

### Loading
Skeletons (the global `.skeleton` class: tint at 0.18, pulsing between 0.45 and 1 opacity over 1.4s) sit at the exact size and pitch of the content they replace, so nothing shifts on load. They hold still at 0.7 under `prefers-reduced-motion`. When results refresh, the previous content stays on screen until the new content arrives.

### Named Rules
**The Not By Colour Alone Rule.** Status colour is always paired with a mark or a word: success and failure carry a tick or cross or a label, and a chart series carries a name.

## Token Index

Every custom property declared in `global.css` or `depth.css` is named in this file, and `src/designSync.test.ts` fails when the two drift. The ones not described above:

- **Colour aliases:** `--bg-1` (Raised Navy), `--label` and `--text` (Gallery Light), `--label-2` (secondary label), `--title-rest`, `--on-art`, `--on-art-2`, `--separator`, `--border` and `--border-2` are the CSS names of the colours in the front matter.
- **Chart colours:** `--series-1`, `--series-2`, `--series-3`, `--series-4`, `--series-5`, `--series-6`, `--series-7` and `--series-8` are the categorical series colours, and `--ramp-lo` and `--ramp-hi` the ends of the sequential ramp in the heatmaps.
- **Scrims:** `--scrim-top` is the light top fade on image cards and heroes, `--scrim-text` the fade under the TopResultCard's text block.
- **Sizing and rhythm:** `--page-scale` is the fluid page base, `--card-size` the width of shelf cards, `--font-sans` the one font stack.
- **Motion:** `--dur` and `--ease` for state changes, `--dur-fast` and `--ease-fast` for hover and focus feedback.
- **Focus ring:** `--focus-width` and `--focus-color`.
- **Materials:** `--material-bg`, `--material-filter` and `--material-edge` build the frosted surface; `--float-shadow` is its shadow.
- **Runtime:** `--wash` is not declared in the token files. It is set inline by a surface, from `useDominantColor`.

## Do's and Don'ts

### Do:
- **Do** derive every chrome colour from `--tint` at low alpha (Wall 0.06, Lit Wall 0.085, Tint Fill 0.09, Tint Chip 0.16).
- **Do** let artwork bring the colour: pass the dominant colour in as `--wash`, cap it at 0.3 and fade it to transparent by about 65%.
- **Do** size new surfaces in `em` from the fluid page base and respond with `@container` queries.
- **Do** caption imagery with white text over a scrim, never on bare artwork.
- **Do** reveal secondary actions (add buttons) on hover or `:focus-within`, and let every interactive element take the global focus ring.
- **Do** use the material tokens for anything floating over content, and keep the reduced-transparency fallback.
- **Do** use the shared Dialog for every modal, with the primary or destructive action last.
- **Do** honour `prefers-reduced-motion`: stop skeleton pulses and image or hero transitions, and flatten the wavy progress line.
- **Do** keep ambient motion (the wavy progress line, the EQ bars) on the compositor: animate `transform` and `opacity`, never layout, and run it only while something is really playing.

### Don't:
- **Don't** use purple, neon or glow, and keep generated hues off 250–330°.
- **Don't** set text below 13px or build cramped, dense rows. No sub-13px metadata.
- **Don't** outline cards, rows, tiles or fields. Separate with a tonal step.
- **Don't** put shadows on content cards. Only artwork and floating surfaces cast them.
- **Don't** introduce a fixed brand accent or a second chrome hue.
- **Don't** use uppercase tracked eyebrows above titles. Hierarchy comes from size and weight.
- **Don't** use raster badges with text baked in. A status is a tonal chip.

## History and activity

- **ActivityRow:** one entry in a log. A phone stacks it in two lines: the 3.2em thumbnail, the title over its detail, then the time over the duration. Once its own container passes 40em it becomes columns that line up down the day: time, thumbnail, title and detail, a note (the device), then the bold duration. The row is a link when it has an `href`, a button with only `onOpen`, and plain text with neither. It has no outline and lights up with the row hover tone.
- **StatGrid:** headline figures as tonal Wall cards, a 13px bold label over a value in the section-title size (the feature size from 40em), laid out by `auto-fit` so a phone gets two across and a wide page up to four.
- **ImageTile menu:** a tile's own actions behind a quiet MoreMenu at the caption's top right, the … centred on the title's first line; the caption stops short of it. Always visible on touch and at phone widths, revealed on hover or focus with a mouse, and it never opens the tile.
- **ResumeHero menu:** an optional MoreMenu beside the action: sharing its row when stacked, just after it when wide.
- **ImageTile play button:** a 2.8em dark disc (`--overlay`, `--overlay-strong` on hover) with a filled play glyph over the art's bottom-right corner. Unlike the add button it is always visible, because a shelf tile has to be playable on a phone. It never opens the tile.
- **BarList name width:** `nameMax` lets the name column grow past 9em on a wide card, so a book title isn't cut to a few words.
