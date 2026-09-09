import { useCallback, useEffect, useRef, useState } from "react";

/* ==========================================================================
   BottomSheet

   Mobile only. The page scrolls normally until the map reaches the top of the
   viewport and pins there. From that point the list becomes draggable: pull the
   handle up to cover the map, down to reveal it.

   Once engaged it stays engaged. Releasing it again on scroll-up was considered
   and rejected — the page starting to move when you expected the sheet to move
   is disorienting.

   Mechanism: the map wrapper is position:sticky (set in App.jsx, marked with
   data-map-stage). This component measures that element to know both when it
   has pinned and how far the list must travel to cover it. The list sits at a
   higher z-index and moves with a transform, which is cheap to animate and
   doesn't trigger layout.

   The handle is a real <button>: arrow keys and Enter move it, so the sheet
   works without touch and is reachable by screen readers.
   ========================================================================== */

/* px per ms. Above this the gesture counts as a flick and its direction wins,
   regardless of how far the sheet actually travelled. Roughly: a deliberate
   flick clears it, a slow drag does not. */
const FLICK_VELOCITY = 0.4;

export default function BottomSheet({ children, enabled = true, label = "Hut list" }) {
  const [engaged, setEngaged] = useState(false);
  const [lift, setLift] = useState(0); // negative px; 0 = at rest, -max = covering
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [scrollH, setScrollH] = useState(null); // px height of the inner scroller

  const wrapRef = useRef(null);
  const drag = useRef(null);
  const maxLift = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const findStage = useCallback(
    () => wrapRef.current?.parentElement?.querySelector("[data-map-stage]") ?? null,
    []
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const measure = () => {
      const stage = findStage();
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      maxLift.current = r.height;

      /* Latched deliberately: once true it never goes back to false. */
      if (r.top <= 1) setEngaged(true);

      /* The list fills from the bottom of the sticky map to the bottom of the
         viewport. Recomputed on every scroll, so when the map pins the page has
         exactly run out of scroll and the handover moves nothing — no jump, and
         scrolling back up chains out of the list into the page natively. */
      const vh = window.innerHeight;
      setScrollH(Math.max(120, vh - r.bottom - lift));
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [enabled, findStage, lift]);

  const onPointerDown = useCallback(
    (e) => {
      if (!engaged) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        startY: e.clientY,
        startLift: lift,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
      };
      setDragging(true);
    },
    [engaged, lift]
  );

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;

    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;

    const next = d.startLift + (e.clientY - d.startY);
    setLift(Math.max(-maxLift.current, Math.min(0, next)));
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const v = d.velocity;
    drag.current = null;
    setDragging(false);

    if (Math.abs(v) > FLICK_VELOCITY) {
      /* Flick: direction wins. A hard swipe down drops the sheet all the way
         back below the map even from near the top. */
      setLift(v > 0 ? 0 : -maxLift.current);
    } else {
      /* Slow drag: past halfway commits to the nearer end. */
      setLift((l) => (l < -maxLift.current / 2 ? -maxLift.current : 0));
    }
  }, []);

  const onKeyDown = useCallback(
    (e) => {
      if (!engaged) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setLift(-maxLift.current);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setLift(0);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setLift((l) => (l === 0 ? -maxLift.current : 0));
      }
    },
    [engaged]
  );

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        zIndex: 3,
        background: "var(--cream)",
        borderRadius: engaged ? "14px 14px 0 0" : 0,
        boxShadow: engaged && lift < 0 ? "0 -3px 16px rgba(58, 42, 32, 0.12)" : "none",
        transform: `translateY(${lift}px)`,
        transition:
          dragging || reduced ? "none" : "transform 200ms cubic-bezier(.22,.61,.36,1)",
        width: "100%",
      }}
    >
      {engaged && (
        <button
          type="button"
          aria-label={`${label} — drag, or use arrow keys, to cover or reveal the map`}
          aria-expanded={lift < 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          style={{
            all: "unset",
            display: "block",
            width: "100%",
            padding: "0.6rem 0 0.45rem",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <span
            style={{
              display: "block",
              width: 38,
              height: 4,
              borderRadius: 2,
              background: "var(--hair)",
              margin: "0 auto",
            }}
          />
        </button>
      )}

      <div
        className="sheet-scroll"
        style={
          engaged && scrollH != null
            ? {
                height: `${scrollH}px`,
                overflowY: "auto",
                /* No overscroll-behavior: contain here. Letting the scroll
                   chain to the page is exactly what makes the handover
                   smooth in both directions. */
                WebkitOverflowScrolling: "touch",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
