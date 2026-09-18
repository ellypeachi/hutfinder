import { useEffect, useMemo, useRef, useState } from "react";

/* ==========================================================================
   DateRange

   Replaces the pair of <input type="date"> fields. The two boxes stay; what
   changes is what they open. Both now open ONE calendar: pick check-in and it
   stays put, switches itself to check-out, and closes when you have both.
   Two native pickers meant dismissing one and opening the other for what is
   a single decision.

   The trade: no native picker, so no typing a date with the keyboard and no
   iOS wheel. That is inherent — the native control is one OS popup per input,
   which is the thing being removed. Day cells are real buttons, so they are
   tabbable, and Escape closes.

   Dates cross this boundary as ISO strings ("2026-09-18"), which is what App
   keeps in `from` / `to` and what the availability snapshot is keyed by. Date
   objects exist only inside this file.
   ========================================================================== */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/* Parsed at local midnight, never Date.parse("2026-09-18"), which is UTC and
   lands on the previous day west of Greenwich. */
function parseISO(s) {
  return s ? new Date(`${s}T00:00:00`) : null;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a, b) {
  return !!a && !!b && a.getTime() === b.getTime();
}
function fmt(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function DateRange({
  from,
  to,
  onChange,
  maxNights = 31,
  isNarrow = false,
}) {
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const start = parseISO(from);
  const end = parseISO(to);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("start");
  const [hover, setHover] = useState(null);
  const [cursor, setCursor] = useState(() => firstOfMonth(parseISO(from) || new Date()));
  const wrapRef = useRef(null);
  const startBtnRef = useRef(null);
  const endBtnRef = useRef(null);

  /* Escape and a finished pick both close the calendar. Whatever had focus
     inside it is then gone from the page, and focus would fall back to the
     body — so it goes to the field the calendar belongs to. */
  const focusField = (which) => {
    const el = which === "end" ? endBtnRef.current : startBtnRef.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  };

  /* pointerdown rather than click: picking a day re-renders the grid, and a
     click handler can end up judging containment against a node that is no
     longer where it was. pointerdown runs first, while the DOM is settled. */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      focusField(mode);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mode]);

  const months = isNarrow ? 1 : 2;
  const monthStarts = [];
  for (let i = 0; i < months; i++) {
    monthStarts.push(new Date(cursor.getFullYear(), cursor.getMonth() + i, 1));
  }

  const limit = start ? addDays(start, maxNights) : null;

  const isDisabled = (d) => {
    if (d < today) return true;
    if (mode === "end" && start) {
      if (d < start) return true;          /* same day is allowed: one night */
      if (limit && d > limit) return true; /* the app's own nights cap */
    }
    return false;
  };

  const pick = (d) => {
    if (mode === "start" || !start || d < start) {
      onChange(toISO(d), "");
      setMode("end");
      setHover(null);
      /* Deliberately stays open. This is the whole point of the component. */
      return;
    }
    const chosen = sameDay(d, start) ? addDays(d, 1) : d;
    onChange(toISO(start), toISO(chosen));
    setMode("start");
    setHover(null);
    setOpen(false);
    focusField("end");
  };

  const openAt = (which) => {
    setOpen((was) => !(was && mode === which));
    setMode(which === "end" && !start ? "start" : which);
  };

  const clear = () => {
    onChange("", "");
    setMode("start");
    setHover(null);
    setOpen(false);
    /* Clearing removes this very button from the page. Without somewhere to
       send focus it lands on the body, and the next Tab restarts at the top
       of the document. */
    focusField("start");
  };

  const nights =
    start && end ? Math.round((end - start) / 86400000) : 0;

  /* The provisional end while sweeping the cursor across the grid. */
  const tail = end || (mode === "end" && hover && hover > start ? hover : null);

  const field = (which, caption, value) => {
    const active = open && mode === which;
    return (
      <button
        type="button"
        ref={which === "end" ? endBtnRef : startBtnRef}
        onClick={() => openAt(which)}
        aria-expanded={active}
        aria-haspopup="dialog"
        className="hf-tap-min"
        style={{
          flex: "1 1 150px",
          minWidth: 0,
          textAlign: "left",
          background: "var(--card)",
          border: `1px solid ${active ? "var(--blue)" : "var(--hair)"}`,
          boxShadow: active ? "0 0 0 2px var(--powder-lt)" : "none",
          borderRadius: 6,
          padding: "0.45rem 0.6rem",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)",
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: "0.68rem",
            color: "var(--ink-soft)",
            marginBottom: 2,
          }}
        >
          {caption}
        </span>
        <span
          style={{
            display: "block",
            fontSize: "0.95rem",
            fontWeight: value ? 600 : 400,
            /* --stone doesn't exist, so this was always the literal
               fallback: 3.1:1 on the card, under the 4.5:1 minimum. */
            color: value ? "var(--ink)" : "var(--ink-soft)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value ? fmt(value) : "Add date"}
        </span>
      </button>
    );
  };

  const dayCell = (d, key) => {
    const disabled = isDisabled(d);
    const isStart = sameDay(d, start);
    const isTail = sameDay(d, tail);
    const inRange = start && tail && d > start && d < tail;
    const edge = isStart || isTail;
    const solo = !start || !tail || sameDay(start, tail);

    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={() => pick(d)}
        onMouseEnter={() => {
          if (mode === "end" && start && !sameDay(hover, d)) setHover(d);
        }}
        /* The visible label is a bare number, which out of the grid means
           nothing — and says nothing about which end of the stay it would
           set. Both go in the label. */
        aria-label={`${mode === "end" ? "Check out" : "Check in"} ${d.getDate()} ${
          MONTHS[d.getMonth()]
        } ${d.getFullYear()}`}
        aria-pressed={edge}
        className="hf-tap"
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          minHeight: 38,
          border: "none",
          background: edge
            ? "var(--blue)"
            : inRange
            ? "var(--powder-lt)"
            : "transparent",
          color: edge ? "#fff" : disabled ? "var(--hair)" : "var(--ink)",
          cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit",
          fontSize: "0.85rem",
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          borderRadius: inRange
            ? 0
            : edge && !solo
            ? isStart
              ? "6px 0 0 6px"
              : "0 6px 6px 0"
            : 6,
        }}
      >
        {d.getDate()}
        {sameDay(d, today) && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 5,
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: edge ? "#fff" : "var(--ink-soft)",
              transform: "translateX(-50%)",
            }}
          />
        )}
      </button>
    );
  };

  const monthGrid = (first) => {
    const lead = (first.getDay() + 6) % 7; /* weeks start Monday */
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) {
      cells.push(<span key={`b${i}`} aria-hidden="true" />);
    }
    for (let n = 1; n <= last; n++) {
      cells.push(dayCell(new Date(first.getFullYear(), first.getMonth(), n), n));
    }
    return (
      <div key={toISO(first)} style={{ flex: "1 1 0", minWidth: 0 }}>
        <div style={{ textAlign: "center", fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.5rem" }}>
          {MONTHS[first.getMonth()]} {first.getFullYear()}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {DOW.map((d) => (
            <span
              key={d}
              style={{
                textAlign: "center",
                fontSize: "0.64rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
              }}
            >
              {d}
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>{cells}</div>
      </div>
    );
  };

  const navBtn = (label, delta, disabled) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))}
      className="hf-tap"
      style={{
        width: 36,
        height: 36,
        border: "1px solid var(--hair)",
        background: "transparent",
        borderRadius: 6,
        color: disabled ? "var(--hair)" : "var(--ink)",
        fontFamily: "inherit",
        fontSize: "1rem",
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {delta < 0 ? "‹" : "›"}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ width: "100%", position: "relative" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "stretch", flexWrap: "wrap" }}>
        {field("start", "Check in", start)}
        {field("end", "Check out", end)}
        {(start || end) && (
          <button
            type="button"
            onClick={clear}
            style={{
              flex: "0 0 auto",
              border: "1px solid var(--line-control)",
              background: "transparent",
              color: "var(--ink)",
              borderRadius: "var(--radius)",
              padding: "0 0.8rem",
              minHeight: 44,
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Choose your dates"
          style={{
            marginTop: "0.6rem",
            background: "var(--card)",
            border: "1px solid var(--hair)",
            borderRadius: 10,
            padding: "0.8rem 0.8rem 0.6rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            {navBtn("Previous month", -1, cursor <= firstOfMonth(today))}
            <span style={{ flex: "1 1 auto" }} />
            {navBtn("Next month", 1, false)}
          </div>

          <div
            style={{ display: "flex", gap: isNarrow ? 0 : "1.6rem" }}
            onMouseLeave={() => setHover(null)}
          >
            {monthStarts.map(monthGrid)}
          </div>

          {/* The calendar switches itself from check-in to check-out without
              moving focus, so this line is the only sign it happened. As a
              status it gets read out when it changes. */}
          <p role="status" style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--ink-soft)", textAlign: "center" }}>
            {mode === "start"
              ? "Pick your check-in day"
              : `Now pick check-out — up to ${maxNights} nights`}
          </p>
        </div>
      )}

      <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
        {nights > 0 ? (
          <>
            <strong style={{ color: "var(--ink)" }}>
              {nights} {nights === 1 ? "night" : "nights"}
            </strong>
            {` · ${fmt(start)}–${fmt(end)}`}
          </>
        ) : start ? (
          `Check-in ${fmt(start)} · pick a check-out date`
        ) : (
          "No dates — showing all huts"
        )}
      </p>
    </div>
  );
}
