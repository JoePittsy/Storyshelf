# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable PWA used as a desktop browser app and as a Home Screen app on iPhone. Both are first-class: the desktop layout must look deliberate, not like a stretched phone layout.

## Users

- **The owner.** Joe runs his own Audiobookshelf (ABS) server in Docker and listens to audiobooks on desktop as much as on iPhone. On iPhone that often means with the phone locked, with headphones, or one-handed. The job is to get back into the current book quickly, keep his place across devices, and browse his own library.
- No other audience is confirmed. Switching between multiple users is out of scope for now. *(Inferred: other members of a household may use their own ABS accounts, but this isn't a design target.)*

## Product Purpose

Storyshelf replaces the ABS web UI for listening. ABS stays the backend for library management, scanning and metadata. Storyshelf is the place to:

- pick up where you left off;
- browse and search your library;
- read about a book and play it;
- control playback in detail: chapters, speed and a sleep timer;
- keep progress in sync with ABS so any device resumes in the same place.

Success means it's the app Joe reaches for instead of the ABS UI or app.

## Positioning

It's built around long-form listening, not songs. Time left and the current chapter matter more than track-level controls:

- the chapter-aware progress windows (Book / Chapter / Sleep);
- an "end of chapter" sleep timer;
- a listening history kept by chapter.

It's also a personal tool on a personal server, with nothing to sell and no catalogue to promote.

## Operating Context

- Bedtime listening with a sleep timer.
- Commuting or walking with a locked phone and headphones; lock-screen and AirPods controls are essential.
- At a desk with a browser tab open beside other work.
- Books often run to 10–40 hours across many files, with dozens of chapters.
- ABS libraries come from real metadata, so descriptions may be missing, a bare URL or messy HTML. Covers may be portrait or square. Some books have no chapters.

## Capabilities and Constraints

- **Same origin:** it talks to the ABS REST API (v2.26+, tested on 2.37.2) from the same origin through a reverse proxy, with no backend of its own.
- **Auth:** access and refresh tokens, with the refresh token held in ABS's httpOnly cookie.
- **Playback:** sessions are opened through ABS, which syncs progress every 10s, on pause and when the app is hidden. It plays books split across many files, on desktop and on iPhone.
- **Out of scope for now:** podcasts, offline downloads, admin features, multi-user switching and uploads.
- **Design system:** `@joepittsy/ui`, a hard fork of TrueTunes, is the design authority. Its design language is in `packages/ui/DESIGN.md`, and the app uses components only from that package.
- **Undecided:** production hosting details, beyond "nginx container in the same Docker setup as ABS".

## Brand Commitments

- The name is "Storyshelf".
- The visual world inherits TrueTunes' "After-Hours Gallery": a dark slate ground (it began as navy), with the cover artwork carrying the colour.
- Text is in UK English and sentence case.

## Evidence on Hand

- The owner's real ABS library, which isn't available to tooling.
- A local test library of 5 LibriVox public-domain books (`e2e/`): an 18-file book, an M4B with chapters, a 2-book series, a book with no narrator, a book with no chapters, and an accented author.
- There are no testimonials, metrics or marketing assets. Don't fabricate any.

## Product Principles

1. **Resume first.** The most common intent is "carry on with my book". It should never be more than one tap away, and it should say where you are: chapter and time left.
2. **Time, not tracks.** Show long-form progress in human terms: hours left, chapter N of M, stops in 12:30.
3. **Never lose my place.** Progress sync and resume are sacred. Destructive or place-losing actions (sign out, jumping chapters) must be hard to trigger by accident.
4. **Desk and pocket are equals.** Every surface is designed for 375px and 1440px+ on purpose.
5. **The library is the user's, not a storefront.** Calm, honest, no upsell. The artwork carries the colour.

## Accessibility & Inclusion

- Everything must be usable by keyboard on desktop.
- It must work with a screen reader. Route changes should be announced and controls clearly named.
- On iPhone it must be usable one-handed, with touch targets of at least 44px.
- Respect reduced motion and reduced transparency.
- Meet WCAG AA contrast.
