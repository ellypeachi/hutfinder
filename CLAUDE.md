# Hüttenfinder — working notes for Claude Code

Hüttenfinder (www.hutfinder.at) lets people find Austrian alpine huts by live bed
availability, then book directly. 1,524 huts. The point of difference is
booking-first: filter by free beds, region and room type, then go straight to
the booking page. Other sites don't offer that.

## Run it

- `npm run dev`: local dev server. Add `-- --host` to open it on a phone on the same wifi.
- `npm run build`: production build into `dist/`.
- `npm run lint`: there are pre-existing findings. Don't add new ones.

Stack: React 19, Vite 8, react-leaflet 5, plain CSS. Map tiles come from
basemap.at inside Austria and OpenStreetMap outside it.

## Where things are

| Path | What |
|---|---|
| `src/App.jsx` | Almost all the UI: filters, list, hut modal, layout. Styles are mostly inline. |
| `src/MapPanel.jsx` | The Leaflet map. Pins are canvas `CircleMarker`s (`preferCanvas`). |
| `src/DateRange.jsx` | The shared check-in/check-out calendar. |
| `src/tokens.css` | Design tokens, base styles, and the accessibility helper classes. |
| `src/map.css` | Leaflet chrome in the house palette. Must load **after** Leaflet's CSS. |
| `public/huts.json` | The hut dataset. |
| `public/availability.json` | Written by a bot. Never edit by hand. |
| `public/photos.json` + `public/photos/` | Hut photos from Wikimedia Commons, served from our own server. `scripts/fetch_photos.py` picks them, then `scripts/download_photos.py` saves them as WebP and adds the `card`/`full` fields. Always run both, in that order: after `fetch_photos.py` alone, no photos show. |
| `imprint/`, `privacy/` | The legal pages, plain HTML (Vite entries in `vite.config.js`, styles in `src/legal.css`). |
| `data/overrides.json` + `apply_overrides.py` | Hand-verified corrections, keyed by hut id. Run `apply_overrides.py` last, after rebuilding `huts.json` (`--check` previews). Fields set here carry `<field>_source: "verified"`, which outranks every other source in the merge scripts. |
| `data/hr_mapping.json` | Hut ↔ HRS booking matches. Entries with `verified: true` are kept by `match_huts.py` on re-runs. |
| `scripts/` | Data pipeline: OSM import, HRS matching, availability fetch. |
| `QA/mobile-qa.md` | The mobile QA checklist. Run it the same way every time. |

## Deploying and git

- **Pushing to `main` puts it live.** `deploy.yml` builds and publishes to GitHub
  Pages on every push to main. Work on a branch, or ask before pushing to main.
- `refresh-availability.yml` commits `public/availability.json` about 5 times a
  day. **Always `git pull --rebase` before pushing**, or the push is rejected.
- Elly's flow: stage specific files (never `git add .`) → commit → `git pull --rebase` → push.
  Small, frequent commits with a clear subject line.

## Design system (src/tokens.css)

- Colours: `--cream` page, `--card` panels, `--ink` primary text,
  `--ink-soft` **all** secondary text, `--hair` decorative edges only,
  `--line-control` borders on anything clickable, `--blue` actions and pins,
  `--blue-deep` hover and link text, `--powder` / `--powder-lt` accents,
  `--pine` / `--rust` / `--burgundy` for bed counts (4+ / 1–3 / full).
- Only two text colours. Build hierarchy with size and weight, never a third grey
  or opacity. Faded text is where contrast fails.
- There is **no `--stone` token**. `#9C8B7D` exists only as `--map-pin-muted` in `map.css`.
- Type: Fraunces (display, needs the `fraunces/full.css` import for the SOFT and
  WONK axes) and Figtree (UI). Scale, spacing, radius and motion are all tokens.
- The bed-count colours sit at similar lightness, so they never carry meaning on
  their own. The gauge shape (full / half / empty) and the number do the work.
- Elly has rejected: large hero treatments ("vibe-coded and generic"), tabular
  figures, coloured tile backgrounds, and architecture beyond what's needed.
- No `font-variant-numeric: tabular-nums` anywhere (tokens.css explains why).
  `DateRange.jsx` still uses it in two places; those should come out.

## Accessibility conventions (pass 9)

- Touch targets: 44px on coarse pointers. Use `.hf-tap` for small controls,
  `.hf-tap-min` for controls with their own layout, `.hf-pill` for filter pills,
  and `.hf-close` for the modal close button. Desktop stays compact.
  An inline `minHeight` outranks these classes, so don't set one.
- Icon-only buttons need an `aria-label`, with the glyph in `aria-hidden`.
- Toggles such as filter pills use `aria-pressed`. `FilterGroup` names each group.
- Overlays (the hut modal, and More filters on a phone) trap Tab with the shared
  `FOCUSABLE` selector, close on Escape, and return focus to their trigger.
- The skip link targets `#results`, or `#hut-map` in Map view. The results list
  is `<main>`; in Map view the map takes that role.
- Text contrast is at least 4.5:1. Use `--ink-soft` for quiet text, not opacity.
- Screen-reader-only text: `.hf-vh`.

## Gotchas already paid for

- Leaflet's `.leaflet-touch` and `a:link` selectors outrank normal rules. The
  `map.css` overrides need `!important` **and** must repeat the `:link` variant,
  or they silently lose.
- The map sits in its own stacking context, so Leaflet's z-index 1000 stays
  contained under overlays.
- `position: sticky` inside a `column-reverse` flex container is unreliable. Use
  `column` with `order: -1`.
- Leaflet caches the container size. `AutoResize` in `MapPanel.jsx` handles
  height changes that don't come with a window resize.

## Data rules

- Never default "unknown" to a confident value. It silently corrupts hundreds of
  huts. Every inferred field is labelled as inferred.
- Data changes go through targeted scripts: run `--check` / `--dry-run` first,
  and match on content, not line numbers.
- Don't trust grep counts when comments contain the search term. Check the actual output.
- Never re-run import_osm.py to refresh the data: it writes data/huts.json, and the region
  boundaries it needs were never saved, so it would lose regions, estimated elevations,
  warden labels and bed fixes. Refresh in place with `bash scripts/refresh_huts.sh`, which
  runs every source in the right order and asks before each step.
- Nothing loads in visitors' browsers from another server without `privacy/index.html` saying so first.
  Photos come only from `public/photos/`: don't add a fallback to Wikimedia URLs.

## How Elly likes to work

- Show a mockup before any structural or visual change.
- Explain what a change does before applying it.
- Keep changes small and surgical. Don't over-engineer.
- She gives direct feedback when something is wrong. Take it at face value.

## Decisions already made (don't reopen unless asked)

- Map pins stay on canvas, so they aren't keyboard-focusable. The list is the
  keyboard route to the same huts.
- Pin clustering is deferred until after live testing.
- Scroll-wheel zoom behaviour and marker re-render performance on hover are accepted as they are.
- On a phone the page is one scroller: the view toggle and map are pinned above
  the list. The draggable bottom sheet was removed.
- Unknown isn't no. Huts that don't publish room types or free beds (not bookable online) are "Unlisted": they stay in the results when a room
  type or dates are picked, in a section after the known matches. Only huts known not to match drop out. Attended huts filter with Serviced.
