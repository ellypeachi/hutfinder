# Hüttenfinder — mobile QA checklist

Run this identically every time. The value is in repeating the same steps in the
same order, so a new failure is obviously new. Record pass/fail and the device;
don't fix anything mid-run, or you lose track of what you actually tested.

---

## Device matrix

Test the top row every time. The second row when something behaves oddly, or
before a release that changed layout.

| Tier | Device | Browser | Why |
|---|---|---|---|
| Core | Your iPhone | Safari | Real target, and the strictest about touch |
| Core | Your iPhone | Chrome iOS | Same engine, different chrome — catches viewport-height bugs |
| Extended | Any Android | Chrome | Different tap handling, different font stack |
| Extended | iPad or tablet | Safari | Lands between the narrow and wide layouts |
| Extended | Old/small phone (SE-sized, 375px) | Safari | Where cramped layouts break first |

## Setup

1. `cd ~/hutfinder && npm run dev -- --host`
2. Note the `Network:` URL it prints.
3. Phone on the same wifi, open that URL.
4. For a console: phone Settings → Apps → Safari → Advanced → Web Inspector on;
   Mac Safari → Settings → Advanced → show developer features; then Safari →
   Develop → [your phone].
5. Test in a private tab so you start without cached state.

---

## A. Touch and hover — highest risk from the map pass

The card-to-pin linking uses `onMouseEnter`, which touch devices don't really
have. iOS synthesises mouse events on first tap, so these are the cases most
likely to be broken right now.

- [ ] Tap a hut card once. Does the detail open on the **first** tap, or does
      the first tap only trigger the hover state?
- [ ] Tap a card whose pin is off-screen. Does the map pan away unexpectedly?
- [ ] After tapping a card and going back, is a card left stuck in the hover
      state (denim border, card background)?
- [ ] Tap a pin on the map. Does the hut open on first tap?
- [ ] Does a tooltip appear on tap and then get stuck with nothing to dismiss it?
- [ ] Scroll the list quickly. Do cards flash hover states as your finger passes?

## B. Map basics

- [ ] Map renders at all; tiles load over mobile data as well as wifi.
- [ ] Austria in basemap.at detail, surrounding countries in OSM.
- [ ] Pinch to zoom works smoothly in both directions.
- [ ] Drag to pan is smooth with all pins loaded, no visible stutter.
- [ ] Double-tap zooms.
- [ ] Zoom buttons are comfortably tappable — the coarse-pointer rule should
      make them 38px. Check they aren't under the notch or home indicator.
- [ ] Attribution is readable and doesn't overlap anything.
- [ ] Rotate to landscape and back. Does the map resize correctly, or stay the
      old dimensions?

## C. Layout

- [ ] At 375px wide, nothing overflows horizontally. Scroll sideways to check —
      the page shouldn't move.
- [ ] Map bottom sheet is a usable height; you can still see list content.
- [ ] Filters and date pickers are reachable and operable one-handed.
- [ ] Text is legible without zooming; nothing below ~14px in body copy.
- [ ] Tap targets are at least 44px — cards, buttons, filter controls.
- [ ] Modal/detail view scrolls internally and can be dismissed.
- [ ] Nothing is hidden behind the browser's bottom bar in Safari.

## D. Performance

- [ ] Time from tapping the URL to seeing pins. Over 5s on 4G is a problem.
- [ ] Panning stays smooth with all 1,524 pins.
- [ ] Scrolling the list stays smooth. If not, that's the marker re-render.
- [ ] Phone doesn't get noticeably warm after a few minutes.
- [ ] Run Lighthouse in mobile mode against the live site; note the performance
      score so you can compare next time.

## E. Real-world conditions

- [ ] Throttle to Slow 4G in DevTools (Network tab) — is the loading state
      acceptable, or does it look broken?
- [ ] Turn wifi off mid-session. Does it fail gracefully?
- [ ] Dark mode on, if the OS setting affects anything.
- [ ] Text size increased in iOS accessibility settings — does layout survive?
- [ ] Reduced motion on — the pan-to-pin should jump rather than glide.

---

## Recording results

For each failure note: device, browser, steps to reproduce, what you expected,
what happened. A bug without repro steps usually can't be fixed later.

```
Device:    iPhone 14, Safari
Steps:     Split view → tap third hut card
Expected:  Detail opens
Actual:    First tap only highlights; needs a second tap
Severity:  High — blocks the main action
```

## Severity

- **Blocker** — can't complete the core task (find a hut, reach a booking link)
- **High** — works but badly; most users would notice
- **Medium** — visible flaw, workaround exists
- **Low** — cosmetic

Fix blockers and high before anything new. Log the rest and move on.
