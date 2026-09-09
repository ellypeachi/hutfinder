import { useCallback, useEffect, useRef, useState } from "react";

/* ==========================================================================
   BottomSheet

   A draggable sheet that sits over the map on narrow screens. Drag the handle
   to trade map for list. Snap points are fractions of the container height,
   measured from the top: 0.15 means the sheet top sits 15% down, so the sheet
   covers 85% of the screen.

   Design notes:

   - Dragging is restricted to the handle. Letting the whole sheet initiate a
     drag conflicts with scrolling the list — the browser cannot tell whether a
     downward swipe means "scroll up" or "close the sheet", and every solution
     to that is fragile. A dedicated handle is unambiguous.

   - Release picks a snap point by position, unless the gesture was a flick, in
     which case direction wins. Without that, a fast short flick feels stuck.

   - The handle is a real <button>. Arrow keys and Enter move between snaps, so
     the sheet is operable without touch. A drag-only sheet is unreachable by
     keyboard and invisible to screen readers.

   - Rendering is skipped entirely when `enabled` is false, so the desktop
     layout is untouched.
   ========================================================================== */

const SNAPS = [0.12, 0.55, 0.86]; // sheet top as a fraction of container height
const FLICK_VELOCITY = 0.45; // px per ms — above this, direction beats position

export default function BottomSheet({
  children,
  enabled = true,
  initialSnap = 1,
  label = "Hut list",
}) {
  const [snap, setSnap] = useState(initialSnap);
  const [dragTop, setDragTop] = useState(null); // px while dragging, else null
  const [reduced, setReduced] = useState(false);

  const wrapRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const containerHeight = useCallback(() => {
    const el = wrapRef.current?.parentElement;
    return el ? el.getBoundingClientRect().height : 0;
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      const h = containerHeight();
      if (!h) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        startY: e.clientY,
        startTop: SNAPS[snap] * h,
        height: h,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
      };
      setDragTop(SNAPS[snap] * h);
    },
    [snap, containerHeight]
  );

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;

    const min = SNAPS[0] * d.height;
    const max = SNAPS[SNAPS.length - 1] * d.height;
    const next = Math.min(max, Math.max(min, d.startTop + (e.clientY - d.startY)));
    setDragTop(next);
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const fraction = (dragTop ?? d.startTop) / d.height;

    let target;
    if (Math.abs(d.velocity) > FLICK_VELOCITY) {
      /* A flick moves one step in the direction of travel rather than snapping
         to whatever happens to be nearest. */
      const current = SNAPS.reduce(
        (best, p, i) =>
          Math.abs(p - d.startTop / d.height) < Math.abs(SNAPS[best] - d.startTop / d.height)
            ? i
            : best,
        0
      );
      target = d.velocity > 0 ? Math.min(SNAPS.length - 1, current + 1) : Math.max(0, current - 1);
    } else {
      target = SNAPS.reduce(
        (best, p, i) => (Math.abs(p - fraction) < Math.abs(SNAPS[best] - fraction) ? i : best),
        0
      );
    }

    drag.current = null;
    setDragTop(null);
    setSnap(target);
  }, [dragTop]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSnap((s) => Math.max(0, s - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSnap((s) => Math.min(SNAPS.length - 1, s + 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSnap((s) => (s + 1) % SNAPS.length);
    }
  }, []);

  if (!enabled) return <>{children}</>;

  const top = dragTop != null ? `${dragTop}px` : `${SNAPS[snap] * 100}%`;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom: 0,
        background: "var(--cream)",
        borderTop: "1px solid var(--hair)",
        borderRadius: "14px 14px 0 0",
        boxShadow: "0 -3px 16px rgba(58, 42, 32, 0.12)",
        display: "flex",
        flexDirection: "column",
        transition: dragTop != null || reduced ? "none" : "top 220ms cubic-bezier(.22,.61,.36,1)",
        zIndex: 500,
      }}
    >
      <button
        type="button"
        aria-label={`${label} — drag, or use arrow keys, to resize`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        style={{
          all: "unset",
          display: "block",
          padding: "0.65rem 0 0.5rem",
          cursor: "grab",
          touchAction: "none",
          flex: "none",
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

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          padding: "0 1rem 1rem",
        }}
      >
        {children}
      </div>
    </div>
  );
}
