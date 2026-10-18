import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import "./night-landscape.css";

/* A landscape behind the foot of the list column: a live 3D scene, the
   self-contained page public/landscape.html drawn in an iframe. It appears
   once the list starts scrolling and clears from a soft haze to the full
   scene the further down you go: after about a screenful of scrolling, or at
   the foot of the page on a list that is shorter than that. With the
   system's reduce-motion setting on, it is a still picture instead.

   Text that can end up on top of it carries the class hf-on-scene. When the
   scene is behind such text, the text switches to a colour that reads on
   that preset (see night-landscape.css). Those cream and deep-brown text
   colours, and the soft fades behind the text, are a deliberate exception to
   the two-text-colour rule: the scene is photographic, so the usual greys
   can't reach 4.5:1 on it.

   The scene follows the visitor's own clock: sunrise, noon, sunset or night.
   Nothing is looked up and nothing leaves the browser. */

const PRESETS = ["sunrise", "noon", "sunset", "night", "rain", "storm", "snow"];

/* Per preset: the haze it clears from, and which text treatment it needs
   where text sits on it — "light" (cream) or "dark" (deeper brown than the
   usual --ink-soft). See night-landscape.css.

   scrim, where there is one: the soft fade behind the notes and the footer
   once the text has taken the preset's own colour (see SCRIM_TONE). Only the
   presets where the text alone stays under 4.5:1 have one, at the lowest
   strength that passes on a computer and a phone. extra is added right after
   the switch and eases off as you scroll on (Storm needs it there). */
const LOOK = {
  sunrise: { haze: "#F1DCC4", text: "dark", scrim: { tone: "cream", alpha: 0.42 } },
  noon: { haze: "#F4F0E8", text: "dark" },
  sunset: { haze: "#EBCFB1", text: "light", scrim: { tone: "dark", alpha: 0.82, extra: 0.1 } },
  night: { haze: "#EBCFB1", text: "light", scrim: { tone: "dark", alpha: 0.45 } },
  rain: { haze: "#E6E2D9", text: "dark", scrim: { tone: "cream", alpha: 0.55 } },
  storm: { haze: "#E6E2D9", text: "light", scrim: { tone: "dark", alpha: 0.45, extra: 0.4 } },
  snow: { haze: "#F4F0E8", text: "dark" },
};

function presetFromClock(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9) return "sunrise";
  if (h >= 9 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "sunset";
  return "night";
}

function pickPreset() {
  const asked = new URLSearchParams(window.location.search).get("sky");
  return PRESETS.includes(asked) ? asked : presetFromClock();
}

const CLEAR_AT = 1000; // px scrolled until the haze is gone (less on a short page, see clearAtNow)
const HEIGHT = 0.5; // share of the window the scene takes, from the bottom
const SOLID_FROM = 0.45; // the top of the scene fades in over this share
const TEXT_AT = 0.4; // how much scene behind text before its colour changes
/* Until this share of the way to a clear scene is scrolled, the haze is still
   light enough to wash the scene out, so the dark text is the one that
   reads, whatever the preset. */
const HAZE_CLEARED = 0.6;
/* The scrim's colour: a "dark" fade sits under cream text, a "cream" fade
   under dark text. The preset's own fade comes in with the same switch as the
   text (HAZE_CLEARED), so a dark fade never sits under the dark text used
   while the haze is on. On the presets whose own text is cream, that dark
   text meanwhile gets a cream fade (LIFT_MAX) that grows from LIFT_FROM to
   HAZE_CLEARED: halfway through the fade-in the scene behind the text is a
   grey-brown that neither colour reads on. */
const SCRIM_TONE = { dark: "30, 20, 13", cream: "244, 240, 232" };
const SCRIM_HEIGHT = 280; // px, from the bottom of the window
const LIFT_FROM = 0.4;
const LIFT_MAX = 0.5;
const scrimGradient = ({ tone, alpha }) => {
  const c = SCRIM_TONE[tone];
  return `linear-gradient(to top, rgba(${c}, ${alpha.toFixed(3)}) 0%, rgba(${c}, ${(alpha * 0.68).toFixed(3)}) 45%, rgba(${c}, 0) 100%)`;
};
/* The scene is rendered taller than the band and cropped at the bottom, so
   the band shows mostly sky and the mountains, with only a strip of meadow. */
const FRAME_SCALE = 1.6;

const clamp = (v) => Math.min(1, Math.max(0, v));
const strengthAt = (y, clearAt = CLEAR_AT) => clamp((y - 20) / 180) * (0.55 + 0.45 * clamp(y / clearAt));

/* How far to scroll before the haze is gone: CLEAR_AT px, or less on a page
   that doesn't scroll that far. Either way the scene is fully clear at the
   foot of the page, where the notes and the footer sit on it. */
const clearAtNow = () =>
  Math.max(60, Math.min(CLEAR_AT, document.documentElement.scrollHeight - window.innerHeight));

/* For people who have asked their system for less motion: the live scene is
   replaced by a still picture of the same preset (public/landscape-stills),
   so nothing moves and the 3D page is never downloaded. The fade that
   follows the scroll stays, and tokens.css already switches transitions off. */
const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches);
  useEffect(() => {
    const mq = window.matchMedia(REDUCED);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* The scene is drawn at this size inside the band, live or still. */
const FRAME_STYLE = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: `${FRAME_SCALE * 100}%`,
  border: 0,
  pointerEvents: "none",
  background: "var(--cream)",
};

export default function NightLandscape({ wide, hidden }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [preset] = useState(pickPreset);
  const [y, setY] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [clearAt, setClearAt] = useState(CLEAR_AT);
  const live = useRef({ hidden, text: LOOK[preset].text });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const sy = window.scrollY;
      const c = clearAtNow();
      setY(sy);
      setClearAt(c);
      if (sy > 20) setMounted(true); // nothing loads until someone scrolls

      // Which text sits on a dark enough part of the scene?
      const vh = window.innerHeight;
      const top = vh * (1 - HEIGHT);
      const strength = live.current.hidden ? 0 : strengthAt(sy, c);
      const text = sy / c < HAZE_CLEARED ? "dark" : live.current.text;
      document.querySelectorAll(".hf-on-scene").forEach((el) => {
        const r = el.getBoundingClientRect();
        const mid = (r.top + r.bottom) / 2;
        const mask = clamp((mid - top) / (vh * HEIGHT * SOLID_FROM));
        if (strength * mask >= TEXT_AT) el.dataset.contrast = text;
        else delete el.dataset.contrast;
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // The page end moves when the list changes (a filter), so re-check then.
    const watch = new ResizeObserver(onScroll);
    watch.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.querySelectorAll(".hf-on-scene").forEach((el) => delete el.dataset.contrast);
    };
  }, []);

  // Switching to Map view (or back) re-checks the text straight away.
  useEffect(() => {
    live.current = { hidden, text: LOOK[preset].text };
    window.dispatchEvent(new Event("scroll"));
  }, [hidden, wide, preset]);

  if (hidden || !mounted) return null;

  const look = LOOK[preset];
  const p = clamp(y / clearAt); // 0 = haze, 1 = clear
  const ownText = p >= HAZE_CLEARED; // the text has the preset's own colour
  const scrims = [];
  if (look.text === "light") {
    const alpha = LIFT_MAX * clamp((p - LIFT_FROM) / (HAZE_CLEARED - LIFT_FROM));
    scrims.push({ key: "lift", tone: "cream", alpha, on: !ownText });
  }
  if (look.scrim) {
    const { tone, alpha, extra = 0 } = look.scrim;
    scrims.push({ key: "own", tone, alpha: alpha + extra * clamp((1 - p) / (1 - HAZE_CLEARED)), on: ownText });
  }
  const fade = `linear-gradient(to bottom, transparent 0%, #000 ${SOLID_FROM * 100}%)`;
  const src = `${import.meta.env.BASE_URL}landscape.html?variant=${preset}`;
  const still = `${import.meta.env.BASE_URL}landscape-stills/${preset}.webp`;

  return (
    <div
      aria-hidden="true"
      data-preset={preset}
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        width: wide ? "min(760px, 50%)" : "100%",
        height: `${HEIGHT * 100}vh`,
        zIndex: 0,
        pointerEvents: "none",
        opacity: strengthAt(y, clearAt),
        WebkitMaskImage: fade,
        maskImage: fade,
        transition: "opacity 120ms linear",
      }}
    >
      {reduced ? (
        <img
          src={still}
          alt=""
          decoding="async"
          style={{ ...FRAME_STYLE, objectFit: "cover", objectPosition: "50% 0" }}
        />
      ) : (
        <iframe
          key={preset}
          src={src}
          title={t("landscape.title")}
          tabIndex={-1}
          sandbox="allow-scripts"
          style={FRAME_STYLE}
        />
      )}
      {/* The haze the scene clears from as you scroll. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, var(--cream) 0%, ${look.haze} 100%)`,
          opacity: 0.8 * (1 - p),
        }}
      />
      {scrims.map((s) => (
        <div
          key={s.key}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: SCRIM_HEIGHT,
            background: scrimGradient(s),
            opacity: s.on ? 1 : 0,
            transition: "opacity var(--dur) var(--ease)",
          }}
        />
      ))}
    </div>
  );
}
