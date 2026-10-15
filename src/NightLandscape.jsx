import { useEffect, useRef, useState } from "react";
import "./night-landscape.css";

/* A live ThreeUI landscape at the foot of the list column (mockup C). It
   appears once the list starts scrolling and clears from a soft haze to the
   full scene the further down you go.

   Text that can end up on top of it carries the class hf-on-scene. When the
   scene is behind such text, the text switches to a colour that reads on
   that preset (see night-landscape.css).

   The scene follows the visitor's own clock: sunrise, noon, sunset or night.
   Nothing is looked up and nothing leaves the browser. For trying the other
   presets, add ?sky=<name> to the address, e.g. ?sky=storm.

   Experiment only (threeui-play branch). */

const PRESETS = ["sunrise", "noon", "sunset", "night", "rain", "storm", "snow"];

/* Per preset: the haze it clears from, and which text treatment it needs
   where text sits on it — "light" (cream) or "dark" (deeper brown than the
   usual --ink-soft). See night-landscape.css. */
const LOOK = {
  sunrise: { haze: "#F1DCC4", text: "dark" },
  noon: { haze: "#F4F0E8", text: "dark" },
  sunset: { haze: "#EBCFB1", text: "light" },
  night: { haze: "#EBCFB1", text: "light" },
  rain: { haze: "#E6E2D9", text: "dark" },
  storm: { haze: "#E6E2D9", text: "light" },
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

const CLEAR_AT = 1000; // px scrolled until the haze is gone
const HEIGHT = 0.5; // share of the window the scene takes, from the bottom
const SOLID_FROM = 0.45; // the top of the scene fades in over this share
const TEXT_AT = 0.4; // how much scene behind text before its colour changes
/* Until this share of CLEAR_AT is scrolled, the haze is still light enough
   to wash the scene out, so the dark text is the one that reads, whatever
   the preset. A short list (a region filter with two huts) never scrolls
   past it. */
const HAZE_CLEARED = 0.6;
/* The scene is rendered taller than the band and cropped at the bottom, so
   the band shows mostly sky and the mountains, with only a strip of meadow. */
const FRAME_SCALE = 1.6;

const clamp = (v) => Math.min(1, Math.max(0, v));
const strengthAt = (y) => clamp((y - 20) / 180) * (0.55 + 0.45 * clamp(y / CLEAR_AT));

export default function NightLandscape({ wide, hidden }) {
  const [preset] = useState(pickPreset);
  const [y, setY] = useState(0);
  const [mounted, setMounted] = useState(false);
  const live = useRef({ hidden, text: LOOK[preset].text });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const sy = window.scrollY;
      setY(sy);
      if (sy > 20) setMounted(true); // nothing loads until someone scrolls

      // Which text sits on a dark enough part of the scene?
      const vh = window.innerHeight;
      const top = vh * (1 - HEIGHT);
      const strength = live.current.hidden ? 0 : strengthAt(sy);
      const text = sy / CLEAR_AT < HAZE_CLEARED ? "dark" : live.current.text;
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
    return () => {
      cancelAnimationFrame(frame);
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
  const p = clamp(y / CLEAR_AT); // 0 = haze, 1 = clear
  const fade = `linear-gradient(to bottom, transparent 0%, #000 ${SOLID_FROM * 100}%)`;
  const src = `${import.meta.env.BASE_URL}landscape.html?variant=${preset}`;

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
        opacity: strengthAt(y),
        WebkitMaskImage: fade,
        maskImage: fade,
        transition: "opacity 120ms linear",
      }}
    >
      <iframe
        key={preset}
        src={src}
        title="Landscape"
        tabIndex={-1}
        sandbox="allow-scripts"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: `${FRAME_SCALE * 100}%`,
          border: 0,
          pointerEvents: "none",
          background: "var(--cream)",
        }}
      />
      {/* The haze the scene clears from as you scroll. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, var(--cream) 0%, ${look.haze} 100%)`,
          opacity: 0.8 * (1 - p),
        }}
      />
    </div>
  );
}
