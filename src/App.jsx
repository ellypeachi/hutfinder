import { Fragment, useEffect, useId, useRef, useState } from "react";
import MapPanel from "./MapPanel";
import DateRange from "./DateRange";
import { useI18n } from "./i18n";
/* The data's own values on the left, a strings key on the right. Anything
   the strings file doesn't cover falls back to the raw value rather than
   vanishing. */
const TYPE_KEYS = ["schutzhuette", "alm", "jausenstation"];
const typeLabel = (t, k) => (TYPE_KEYS.includes(k) ? t(`type.${k}`) : k);

const WARDEN_KEYS = ["bewirtschaftet", "bewartet", "selbstversorger"];
const wardenLabel = (t, k) => (WARDEN_KEYS.includes(k) ? t(`warden.${k}`) : k);

const ASSOC_KEYS = ["alpine_club", "naturfreunde", "private"];
const assocName = (t, k) => (ASSOC_KEYS.includes(k) ? t(`assoc.${k}`) : k);

// Region names are place names and stay as they are; only the catch-all is text.
const regionLabel = (t, r) => (r === "Other/Unknown" ? t("region.other") : r);

const CLUB_LABEL = {
  OEAV: "ÖAV",
  DAV: "DAV",
  AVS: "AVS",
  alpGesPreintaler: "Alpengesellschaft Preintaler",
};

// Room-type buckets — snapshot arrays are ordered [dorm, shared, private]
const BUCKET_ORDER = ["dorm", "shared", "priv"];
const BUCKET_IDX = { dorm: 0, shared: 1, priv: 2 };
const bucketLabel = (t, k) => t(`bucket.${k}`);
const bucketPlural = (t, k) => t(`bucketPlural.${k}`);
/* Only huts bookable online publish their room types and free beds. The rest
   are "unlisted", which is not the same as "no": they stay in the results
   when a room type or dates are picked, after the huts known to match. */
const ROOM_NONE = "none";

const REGION_ORDER = [
  "Tirol",
  "Salzburg",
  "Steiermark",
  "Kärnten",
  "Niederösterreich",
  "Oberösterreich",
  "Vorarlberg",
  "Burgenland",
  "Wien",
  "Other/Unknown",
];

const ELEV_BANDS = [
  { key: "e1", lo: -Infinity, hi: 1000 },
  { key: "e2", lo: 1000, hi: 1500 },
  { key: "e3", lo: 1500, hi: 2000 },
  { key: "e4", lo: 2000, hi: 2500 },
  { key: "e5", lo: 2500, hi: Infinity },
];
/* "1,000–1,500 m" in English, "1.000–1.500 m" in German — the separator is
   the formatter's, not ours. */
const bandLabel = (t, nf, band) =>
  t(`elev.${band.key}`, {
    n: nf(band.key === "e1" ? band.hi : band.lo),
    a: nf(band.lo),
    b: nf(band.hi),
  });
const ELEV_UNKNOWN = "unknown";

const RESULT_LIMIT = 300;
const MAX_NIGHTS = 31;
const MODAL_MS = 150; // keep in sync with --dur in tokens.css

/* What a focus trap counts as a stop. Shared by the hut modal and the
   narrow-screen More filters overlay so the two can't drift apart. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function bandOf(h) {
  const e = h.elevation;
  if (!isNumber(e)) return ELEV_UNKNOWN;
  const b = ELEV_BANDS.find((band) => e >= band.lo && e < band.hi);
  return b ? b.key : ELEV_UNKNOWN;
}

function isNumber(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

// traffic light for free beds: red = full, amber = nearly full (1–3), green = space (4+)
function bedColor(n) {
  if (n <= 0) return "var(--burgundy)";
  if (n <= 3) return "var(--rust)";
  return "var(--pine)";
}

function fmtISO(s) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function todayISO() {
  return toISO(new Date());
}

function nextDayISO(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return toISO(d);
}

// snapshot timestamp (UTC ISO) shown in Austrian local time, DST-aware, with zone label
function fmtGenerated(iso, locale) {
  try {
    return new Date(iso).toLocaleString(locale, {
      timeZone: "Europe/Vienna",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

/* The facts people skim for, most useful first. A card shows the first
   three and the pop-up all of them. Anything the data doesn't know is left
   out rather than shown as "unknown", and an inferred value says so
   ("Usually serviced"). */
function hutTags(hut, t) {
  const tags = [];
  if (hut.club) tags.push({ label: CLUB_LABEL[hut.club] || hut.club, club: true });
  else if (hut.association) tags.push({ label: assocName(t, hut.association) });
  const beds = isNumber(hut.hr_capacity) ? hut.hr_capacity : hut.sleeping;
  if (beds > 0) tags.push({ label: t("tag.beds", { count: beds, n: beds }) });
  else if (beds === 0) tags.push({ label: t("tag.noOvernight") });
  if (hut.warden === "bewirtschaftet") {
    tags.push({
      label: hut.warden_source === "inferred" ? t("tag.usuallyServiced") : t("warden.bewirtschaftet"),
    });
  } else if (hut.warden === "bewartet") tags.push({ label: t("warden.bewartet") });
  else if (hut.warden === "selbstversorger") tags.push({ label: t("warden.selbstversorger") });
  if (hut.shower === true) tags.push({ label: t("tag.shower") });
  if (hut.winterraum === true) tags.push({ label: t("tag.winterRoom") });
  if (hut.hr_dogs === true) tags.push({ label: t("tag.dogsWelcome") });
  else if (hut.hr_dogs === false) tags.push({ label: t("tag.noDogs") });
  return tags;
}

function Tags({ tags }) {
  return (
    <ul className="hf-tags">
      {tags.map((t) => (
        <li key={t.label} className={t.club ? "hf-tag hf-tag-club" : "hf-tag"}>
          {t.label}
        </li>
      ))}
    </ul>
  );
}

// Some hut websites come without a scheme ("www.hut.at"), which a bare href
// would treat as a path on this site.
function webHref(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function webLabel(url) {
  try {
    return new URL(webHref(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function phoneLabel(phone) {
  return phone.replace(/\s*\/\s*/g, " ").trim();
}
function telHref(phone) {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

// Hut texts from hut-reservation.org arrive as HTML. A parsed document is
// inert (no scripts run, nothing loads), so reading its text is safe.
function plainText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

/* Photos are served from our own server (public/photos/, written by
   scripts/download_photos.py), never from Wikimedia: loading them from there
   would hand every visitor's IP address to a US server, and the privacy
   policy says it doesn't happen. */
function photoSrc(path) {
  return `${import.meta.env.BASE_URL}${path}`;
}

/* The card's "opens more" mark, as on a list row on a phone. Decorative:
   the hut name is the card's button and says what it opens. */
function ChevronIcon() {
  return (
    <svg className="hf-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/* Two lines of the hut's own text, with "Read more" at the end of the second
   line (the float trick behind .hf-desc in tokens.css). The button only
   appears when the text is actually cut off; that is measured in a ref
   callback once the paragraph is laid out. */
function Description({ text }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const measure = (el) => {
    if (!el || open) return;
    const isCut = el.scrollHeight > el.clientHeight + 1;
    if (isCut !== cut) setCut(isCut);
  };
  return (
    <div className="hf-desc-wrap">
      <p ref={measure} className={open ? "hf-desc is-open" : "hf-desc"}>
        {!open && cut ? (
          <button type="button" className="hf-more" aria-expanded="false" onClick={() => setOpen(true)}>
            <span>{t("detail.readMore")}</span>
          </button>
        ) : null}
        {text}
        {open ? (
          <button type="button" className="hf-more" aria-expanded="true" onClick={() => setOpen(false)}>
            <span>{t("detail.showLess")}</span>
          </button>
        ) : null}
      </p>
    </div>
  );
}

function nightsBetween(from, to) {
  if (!from) return [];
  // `to` is the check-out day — you don't sleep that night. No `to` = a single night.
  const endExclusive = to && to > from ? to : nextDayISO(from);
  const list = [];
  const d = new Date(from + "T00:00:00");
  const e = new Date(endExclusive + "T00:00:00");
  while (d < e && list.length < MAX_NIGHTS) {
    list.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return list;
}

function Dot({ n, color }) {
  const c = color || bedColor(n);
  const lvl = n <= 0 ? "empty" : n <= 3 ? "half" : "full";
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" aria-hidden="true"
      style={{ display: "inline-block", marginRight: 6, verticalAlign: "-1px" }}>
      {lvl === "full" ? <circle cx="10" cy="10" r="8" fill={c} /> : null}
      {lvl === "half" ? <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="2.8" /> : null}
      {lvl === "half" ? <path d="M10 2a8 8 0 0 1 0 16z" fill={c} /> : null}
      {lvl === "empty" ? <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="2.8" /> : null}
    </svg>
  );
}

function Pill({ active, onClick, label, count }) {
  const empty = count === 0 && !active; // ZERO_STATE_PILLS
  return (
    <button
      onClick={onClick}
      /* A filter pill is a toggle, not a link: aria-pressed is what makes a
         screen reader say "Tirol, pressed" rather than leaving the state to
         the blue fill, which not everyone can see. */
      aria-pressed={active}
      className="hf-tap hf-pill"
      style={{
        border: active ? "1px solid var(--ink)" : "1px solid var(--hair)",
        background: active ? "var(--blue)" : empty ? "transparent" : "var(--card)",
        color: active ? "#fff" : empty ? "var(--ink-soft)" : "var(--ink)",
        borderRadius: 999,
        padding: "0.32rem 0.72rem",
        marginRight: "0.4rem",
        marginBottom: "0.4rem",
        fontSize: "0.85rem",
        cursor: "pointer",
        lineHeight: 1.2,
      }}
    >
      {label}
      {count != null && (
        /* The count used to be the label colour at 0.45 opacity, which lands
           at 2.6:1 on cream — the quiet look was coming from washing the text
           out. --ink-soft is the token for exactly this job and measures
           5.7:1; on the blue pill, white at 0.8 measures 4.7:1. */
        <span
          style={{
            color: active ? "rgba(255,255,255,0.8)" : "var(--ink-soft)",
            marginLeft: "0.4rem",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FilterGroup({ label, note, children }) {
  /* The little uppercase caption is the group's name on screen; tying the
     pills to it with a labelled group makes it the group's name in a screen
     reader too, so "Serviced" arrives as "Warden: Serviced" rather than on
     its own with no idea what it filters. */
  const labelId = useId();
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div
        id={labelId}
        style={{
          fontSize: "0.7rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          marginBottom: "0.45rem",
        }}
      >
        {label}
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}
      >
        {children}
      </div>
      {note ? (
        <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", lineHeight: 1.45, color: "var(--ink-soft)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
function useIsNarrow(max = 860) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [max]);
  return narrow;
}
export default function App() {
  /* nf is the old fmtN under its new name: the same thousands separator,
     now the active language's. */
  const { t, nf: fmtN, locale } = useI18n();
  const [huts, setHuts] = useState([]);
  const [avail, setAvail] = useState(null);
  const [photos, setPhotos] = useState({}); // hut id -> Commons photo, from photos.json
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState([]); // MULTI_SELECT
  const [type, setType] = useState([]); // MULTI_SELECT
  const [warden, setWarden] = useState(null);
  const [elev, setElev] = useState([]); // MULTI_SELECT
  const [assoc, setAssoc] = useState(null);
  const [showerOnly, setShowerOnly] = useState(false);
  const [bookableOnly, setBookableOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [roomType, setRoomType] = useState(null); // "dorm" | "shared" | "priv" | null
  const [view, setView] = useState("split");
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false); // drives the enter/exit transition
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);   // what gets focus back
  const closeTimer = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);      // the panel
  const moreBtnRef = useRef(null);   // what opened it, and what gets focus back
  const closeModal = () => {
  if (!selected) return;
  setModalOpen(false);
  const back = triggerRef.current;
  if (back && document.contains(back)) back.focus({ preventScroll: true });
  triggerRef.current = null;
  clearTimeout(closeTimer.current);
  closeTimer.current = setTimeout(
    () => setSelected(null),
    reducedMotion() ? 0 : MODAL_MS
  );
};
  useEffect(() => {
  if (!selected) return;
  clearTimeout(closeTimer.current);

  // remember the trigger, but only on first open — switching pins
  // while the modal is up shouldn't overwrite it
  if (!triggerRef.current) {
    const a = document.activeElement;
    triggerRef.current = a && a !== document.body ? a : null;
  }

  const raf = requestAnimationFrame(() => setModalOpen(true));
  dialogRef.current?.focus({ preventScroll: true });

  const onKey = (e) => {
    if (e.key === "Escape") return closeModal();
    if (e.key !== "Tab") return;
    const box = dialogRef.current;
    if (!box) return;
    const nodes = box.querySelectorAll(FOCUSABLE);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && here === last) {
      e.preventDefault();
      first.focus();
    }
  };

  window.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
  };
}, [selected]);

  const closeMore = () => {
    setShowMore(false);
    const back = moreBtnRef.current;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  };


  const moreCount =
    [bookableOnly, showerOnly, warden, assoc].filter(Boolean).length +
    [type, elev].filter((a) => a.length).length;
  const isNarrow = useIsNarrow();

  /* More filters is two things wearing the same markup: an inline panel on
     desktop, and on a phone a full-screen overlay. The overlay covers the
     page, so it has to behave like one — focus moves into it, Tab cycles
     inside it, and closing hands focus back to the button that opened it.
     Without the trap, Tab walks out of a panel that is still on top of
     everything and into controls nobody can see.

     The inline panel is left alone: focus staying put is correct for a
     disclosure. Escape closes either. */
  useEffect(() => {
    if (!showMore) return undefined;
    if (isNarrow) moreRef.current?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMore();
        return;
      }
      if (e.key !== "Tab" || !isNarrow) return;
      const box = moreRef.current;
      if (!box) return;
      const nodes = box.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || here === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && here === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMore, isNarrow]);

  /* The toggle drives both breakpoints now. On a phone it used to be hidden,
     which left no way to ask for a full-height map or a full-height list. */
  const showMap = view !== "list";
  const showList = view !== "map";

  /* Getting back to the top of 300 cards was a lot of thumb, and swiping over
     the map pans the map rather than scrolling the page — so the only way up
     was repeated swipes on the list. A jump-to-top sits in the pinned bar,
     where a thumb already is, and appears once there is something to go back
     to. Only the threshold crossing sets state, so this costs one render per
     crossing rather than one per scroll frame. */
  const [scrolledDown, setScrolledDown] = useState(false);
  useEffect(() => {
    /* Desktop never reads this — the button only renders on a phone — so the
       stale value is harmless and clearing it here would be a synchronous
       setState inside an effect. */
    if (!isNarrow) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolledDown(window.scrollY > 320));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isNarrow]);

  const scrollToTop = () =>
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}huts.json`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then((data) => {
        setHuts(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    fetch(`${import.meta.env.BASE_URL}availability.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAvail(data))
      .catch(() => setAvail(null));
    // Photos are a nice-to-have: if the file is missing the cards just have none.
    // Only photos stored on our own server count; one that didn't download is
    // left out rather than loaded from Wikimedia.
    fetch(`${import.meta.env.BASE_URL}photos.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const all = (data && data.photos) || {};
        setPhotos(Object.fromEntries(Object.entries(all).filter(([, p]) => p.card && p.full)));
      })
      .catch(() => setPhotos({}));
  }, []);

  const nights = nightsBetween(from, to);

  const recOf = (h) => (h.hr_hut_id && avail && avail.huts ? avail.huts[h.hr_hut_id] : null);
  const nightArr = (rec, d) => (rec && rec.days && d in rec.days ? rec.days[d] : null);

  // minimum free beds per bucket across all requested nights; null if any night is closed
  const minBuckets = (h) => {
    const rec = recOf(h);
    if (!rec) return null;
    const mins = [Infinity, Infinity, Infinity];
    for (const d of nights) {
      const a = nightArr(rec, d);
      if (!a) return null;
      for (let i = 0; i < 3; i++) mins[i] = Math.min(mins[i], a[i] || 0);
    }
    return mins.map((m) => (m === Infinity ? 0 : m));
  };

  const nextFree = (h) => {
    const rec = recOf(h);
    if (!rec || !rec.days) return null;
    const t = todayISO();
    for (const d of Object.keys(rec.days).sort()) {
      const a = rec.days[d];
      const total = (a[0] || 0) + (a[1] || 0) + (a[2] || 0);
      if (d >= t && total > 0) return { date: d, free: total };
    }
    return null;
  };
  /* Availability, shown the same way on a card and in the pop-up: the free
     beds per room type once dates are picked, otherwise the next free date. */
  const availBlock = (hut) => {
    if (!avail || !hut.hr_hut_id) return null;
    const rec = recOf(hut);
    const nf = !nights.length ? nextFree(hut) : null;
    const mins = nights.length ? minBuckets(hut) : null;
    if (nights.length && mins && rec && rec.caps) {
      return (
        <div>
          <div style={{ fontSize: "0.8rem", marginBottom: "0.45rem" }}>
            <span style={{ color: "var(--ink)", fontWeight: 700 }}>{t("avail.free", { range: rangeLabel })}</span>
            {nights.length > 1 ? (
              <span style={{ color: "var(--ink-soft)" }}>{t("avail.fewest")}</span>
            ) : null}
          </div>
          {BUCKET_ORDER.map((k) => {
            const idx = BUCKET_IDX[k];
            if (!(rec.caps[idx] > 0)) return null;
            const n = mins[idx];
            return (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  maxWidth: 240,
                  padding: "1px 0",
                }}
              >
                <span style={{ color: "var(--ink-soft)" }}>
                  <Dot n={n} />
                  {bucketLabel(t, k)}
                </span>
                <span style={{ color: bedColor(n), fontWeight: 700 }}>
                  {n > 0 ? t("avail.beds", { count: n, n }) : t("avail.full")}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    if (nf) {
      return (
        <span style={{ color: "var(--ink-soft)" }}>
          <Dot n={nf.free} />
          {t("avail.nextFree", { date: fmtISO(nf.date), n: nf.free })}
        </span>
      );
    }
    if (rec) return <span style={{ color: "var(--ink-soft)" }}>{t("avail.none")}</span>;
    return null;
  };

  const bookButton = (hut) => (
    <a
      href={hut.hr_booking_url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={t("book.aria", { hut: hut.name })}
      className="hf-tap"
      style={{
        background: "var(--blue)",
        color: "#fff",
        textDecoration: "none",
        padding: "0.3rem 0.65rem",
        borderRadius: "var(--radius)",
        fontWeight: 600,
        fontSize: "0.82rem",
        whiteSpace: "nowrap",
      }}
    >
      {t("book.online")}
    </a>
  );

  /* A hut that can't be booked online: the phone number is the next step, so
     it is the button. */
  const callBand = (hut) =>
    hut.phone ? (
      <div className="hf-card-band hf-card-band-row">
        <a
          href={telHref(hut.phone)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t("call.aria", { hut: hut.name, phone: phoneLabel(hut.phone) })}
          className="hf-call hf-tap"
        >
          <PhoneIcon />
          {t("call.label", { phone: phoneLabel(hut.phone) })}
        </a>
        <span>{t("band.notBookable")}</span>
      </div>
    ) : hut.website || hut.email ? (
      /* No phone number, but a website or an email is still a way to ask. */
      <div className="hf-card-band hf-card-band-row">
        {hut.website ? (
          <a
            href={webHref(hut.website)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={t("contact.websiteAria", { hut: hut.name, host: webLabel(hut.website) })}
            className="hf-call hf-tap"
          >
            <GlobeIcon />
            {t("contact.website")}
          </a>
        ) : (
          <a
            href={`mailto:${hut.email}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("contact.emailAria", { hut: hut.name, email: hut.email })}
            className="hf-call hf-tap"
          >
            <MailIcon />
            {t("contact.email")}
          </a>
        )}
        <span>{t("band.notBookable")}</span>
      </div>
    ) : (
      <div className="hf-card-band">
        <span>{t("band.notBookableNoContact")}</span>
      </div>
    );

  const metaLine = (hut) =>
    `${typeLabel(t, hut.type)}${
      isNumber(hut.elevation) ? ` · ${hut.elevation} m${hut.elevation_estimated ? "*" : ""}` : ""
    }`;

  /* A card in the list: only what it takes to choose a hut. Everything else
     is in the pop-up. The hut name is the card's button: one labelled stop
     that says which hut it opens, instead of a whole card announced as a
     button whose name is every word inside it. */
  const hutCard = (hut, open) => {
    const photo = photos[hut.id];
    const tags = hutTags(hut, t).slice(0, 3);
    return (
      <>
        <div className="hf-card-head">
          {photo ? (
            <img
              className="hf-thumb"
              src={photoSrc(photo.card)}
              width={96}
              height={72}
              alt=""
              loading="lazy"
              decoding="async"
              title={`${t("detail.photoCredit")} ${photo.credit} · ${photo.license}`}
            />
          ) : null}
          <div className="hf-card-title">
            <div style={{ fontWeight: 600, fontSize: "1.05rem", lineHeight: 1.3 }}>
              <button
                type="button"
                className="hf-cardname"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                /* Keyboard focus lights the card and pans its pin, the same as
                   hovering it with a mouse. */
                onFocus={() => setHoveredId(hut.id)}
                onBlur={() => setHoveredId(null)}
              >
                {hut.name}
              </button>
            </div>
            <div className="hf-card-meta">{metaLine(hut)}</div>
            {hut.region ? <div className="hf-card-meta">{regionLabel(t, hut.region)}</div> : null}
          </div>
          <ChevronIcon />
        </div>
        {tags.length ? <Tags tags={tags} /> : null}
        {hut.hr_hut_id ? (
          <div className="hf-card-band">
            {availBlock(hut)}
            <div>{bookButton(hut)}</div>
          </div>
        ) : (
          callBand(hut)
        )}
      </>
    );
  };

  /* The pop-up: the photo and its credit, how to reach the hut, every tag,
     the hut's own description, and the booking row as it has always been. */
  const hutDetail = (hut) => {
    const photo = photos[hut.id];
    const notes = hut.hr_notes ? plainText(hut.hr_notes) : "";
    const tags = hutTags(hut, t);
    return (
      <>
        {photo ? (
          <>
            <img
              className="hf-detail-photo"
              src={photoSrc(photo.full)}
              width={420}
              height={220}
              alt={hut.name}
            />
            <p className="hf-credit">
              {t("detail.photoCredit")} {photo.credit} ·{" "}
              <span style={{ whiteSpace: "nowrap" }}>{photo.license}</span>
            </p>
          </>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            padding: photo
              ? "0.75rem 1.4rem 1.25rem"
              : isNarrow
              ? "2.6rem 1.4rem 1.25rem"
              : "1.25rem 1.4rem",
          }}
        >
          <div>
            <h2 className="hf-detail-name">{hut.name}</h2>
            <div className="hf-card-meta" style={{ fontSize: "0.9rem" }}>
              {typeLabel(t, hut.type)}
              {hut.region ? ` · ${regionLabel(t, hut.region)}` : ""}
              {isNumber(hut.elevation)
                ? ` · ${hut.elevation} m${hut.elevation_estimated ? "*" : ""}`
                : ""}
            </div>
          </div>
          {hut.phone || hut.website || hut.email ? (
            <div className="hf-contact">
              {hut.phone ? (
                <a href={telHref(hut.phone)} className="hf-tap-min" aria-label={t("call.aria", { hut: hut.name, phone: phoneLabel(hut.phone) })}>
                  <PhoneIcon />
                  <span>{phoneLabel(hut.phone)}</span>
                </a>
              ) : null}
              {hut.website ? (
                <a
                  href={webHref(hut.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="hf-tap-min"
                  aria-label={t("contact.websiteAria", { hut: hut.name, host: webLabel(hut.website) })}
                >
                  <GlobeIcon />
                  <span>{webLabel(hut.website)}</span>
                </a>
              ) : null}
              {hut.email ? (
                <a href={`mailto:${hut.email}`} className="hf-tap-min" aria-label={t("contact.emailAria", { hut: hut.name, email: hut.email })}>
                  <MailIcon />
                  <span>{hut.email}</span>
                </a>
              ) : null}
            </div>
          ) : null}
          {tags.length ? <Tags tags={tags} /> : null}
          {notes ? (
            <div>
              <div className="hf-label">{t("detail.description")}</div>
              <Description key={hut.id} text={notes} />
            </div>
          ) : null}
          {hut.hr_hut_id ? (
            <div
              style={{
                paddingTop: "0.6rem",
                borderTop: "1px solid var(--hair)",
                fontSize: "0.85rem",
                color: "var(--ink-soft)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem" }}>
                {bookButton(hut)}
                <span>
                  {hut.club ? CLUB_LABEL[hut.club] || hut.club : null}
                  {isNumber(hut.hr_half_board_eur) ? t("detail.halfBoard", { n: hut.hr_half_board_eur }) : ""}
                  {hut.hr_dogs === true ? t("detail.dogsWelcome") : hut.hr_dogs === false ? t("detail.noDogs") : ""}
                </span>
                {hut.hr_price_pdf ? (
                  <a
                    href={hut.hr_price_pdf}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("detail.priceListAria", { hut: hut.name })}
                    /* Sits in a row of its own rather than inside a sentence,
                       so the inline-link exemption doesn't cover it. */
                    className="hf-tap"
                    style={{ color: "var(--blue-deep)", fontWeight: 600, textDecoration: "none" }}
                  >
                    <span style={{ borderBottom: "1px solid var(--powder)" }}>{t("detail.priceList")}</span>
                  </a>
                ) : null}
              </div>
              {avail ? <div style={{ marginTop: "0.5rem" }}>{availBlock(hut)}</div> : null}
            </div>
          ) : (
            callBand(hut)
          )}
        </div>
      </>
    );
  };
  const regionOf = (h) => h.region || "Other/Unknown";
  // "Attended" (bewartet) huts are filtered with Serviced: someone is there.
  // Their cards still say "Attended".
  const wardenOf = (h) => (h.warden === "bewartet" ? "bewirtschaftet" : h.warden);
  const assocOf = (h) => h.association || "unknown";

  // Does a hut with room data offer this bucket? With dates it has to be
  // free every night; without, the hut simply has to offer it.
  const roomOk = (rec, idx) => {
    if (!nights.length) return !!(rec.caps && rec.caps[idx] > 0);
    for (const d of nights) {
      const a = nightArr(rec, d);
      if (!a || !(a[idx] > 0)) return false;
    }
    return true;
  };

  const bedsOf = (h) => (isNumber(h.hr_capacity) ? h.hr_capacity : h.sleeping);
  const noBeds = (h) => bedsOf(h) === 0;

  const passes = (h, skip) => {
    if (skip !== "query" && query && !h.name.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (skip !== "region" && region.length && !region.includes(regionOf(h))) return false;
    if (skip !== "type" && type.length && !type.includes(h.type)) return false;
    if (skip !== "warden" && warden && wardenOf(h) !== warden) return false;
    if (skip !== "elev" && elev.length && !elev.includes(bandOf(h))) return false;
    if (skip !== "assoc" && assoc && assocOf(h) !== assoc) return false;
    if (skip !== "shower" && showerOnly && h.shower !== true) return false;
    if (skip !== "bookable" && bookableOnly && !h.hr_hut_id) return false;

    // date filter: every requested night must be open with at least one free
    // bed. Huts that don't publish availability are unknown, not full, so
    // they stay (listed after the huts with space) unless they're known to
    // have no beds at all.
    if (nights.length) {
      const rec = recOf(h);
      if (!rec) {
        if (!avail || noBeds(h)) return false;
      } else for (const d of nights) {
        const a = nightArr(rec, d);
        if (!a || (a[0] || 0) + (a[1] || 0) + (a[2] || 0) <= 0) return false;
      }
    }

    // room-type filter: only huts known NOT to have the room type drop out.
    // Huts that don't list room types stay (the list shows them after the
    // matches). "Unlisted" on its own keeps only those huts.
    if (skip !== "roomType" && roomType) {
      const rec = recOf(h);
      if (roomType === ROOM_NONE) {
        if (rec) return false;
      } else if (rec && !roomOk(rec, BUCKET_IDX[roomType])) {
        return false;
      }
    }
    return true;
  };

  /* With a room type or dates picked, the huts known to match come first, then
     the unlisted huts (no room types or availability online) — those that
     list beds before those that don't. */
  const sortByRoom = !!roomType && roomType !== ROOM_NONE;
  const splitUnlisted = sortByRoom || nights.length > 0;
  const hasBeds = (h) => bedsOf(h) > 0;
  // Within Unlisted: huts you can actually ask (phone, website or email)
  // first, then those that list beds. Otherwise the original order holds.
  const unlistedRank = (h) => (h.phone || h.website || h.email ? 0 : 2) + (hasBeds(h) ? 0 : 1);
  let filtered = huts.filter((h) => passes(h));
  if (splitUnlisted) {
    const listed = filtered.filter((h) => recOf(h));
    const unlisted = filtered.filter((h) => !recOf(h));
    filtered = [...listed, ...unlisted.sort((a, b) => unlistedRank(a) - unlistedRank(b))];
  }
  const matchCount = splitUnlisted ? filtered.filter((h) => recOf(h)).length : 0;
  const unlistedCount = splitUnlisted ? filtered.length - matchCount : 0;

  const facet = (skip, keyFn) => {
    const counts = {};
    for (const h of huts) {
      if (!passes(h, skip)) continue;
      const k = keyFn(h);
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  };
  const regionCounts = facet("region", regionOf);
  const typeCounts = facet("type", (h) => h.type);
  const wardenCounts = facet("warden", wardenOf);
  const elevCounts = facet("elev", bandOf);
  const assocCounts = facet("assoc", assocOf);
  const showerCount = huts.filter((h) => passes(h, "shower") && h.shower === true).length;
  const bookableCount = huts.filter((h) => passes(h, "bookable") && h.hr_hut_id).length;

  // room-type counts: a hut can offer several types, so count each bucket it
  // qualifies for; huts without room data count once, under "Unlisted"
  const roomTypeCounts = { dorm: 0, shared: 0, priv: 0, [ROOM_NONE]: 0 };
  if (avail) {
    for (const h of huts) {
      if (!passes(h, "roomType")) continue;
      const rec = recOf(h);
      if (!rec) {
        roomTypeCounts[ROOM_NONE]++;
        continue;
      }
      for (const k of BUCKET_ORDER) {
        if (roomOk(rec, BUCKET_IDX[k])) roomTypeCounts[k]++;
      }
    }
  }

  const allRegionKeys = Array.from(new Set(huts.map(regionOf)));
  const presentRegions = REGION_ORDER.filter((r) => allRegionKeys.includes(r)).concat(
    allRegionKeys.filter((r) => !REGION_ORDER.includes(r)).sort()
  );

  const anyFilter =
    region.length || type.length || warden || elev.length || assoc || showerOnly || bookableOnly || from || roomType || query;
  const anyNonDate =
    region.length || type.length || warden || elev.length || assoc || showerOnly || bookableOnly || roomType || query;
  const toggle = (arr, setArr, v) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const clearAll = () => {
    setRegion([]);
    setType([]);
    setWarden(null);
    setElev([]);
    setAssoc(null);
    setShowerOnly(false);
    setBookableOnly(false);
    setRoomType(null);
    setQuery("");
  };

  // Chip and "Drop …" wording, where "Unlisted" needs saying what it is
  const roomLabel = (k) => (k === ROOM_NONE ? t("label.roomTypeUnlisted") : bucketLabel(t, k));
  const assocLabel = (a) => (a === "unknown" ? t("label.assocUnlisted") : assocName(t, a));
  const activeChips = [];
  if (query)
    activeChips.push({ k: "q", label: t("chip.query", { q: query }), clear: () => setQuery("") });
  for (const r of region)
    activeChips.push({
      k: "region:" + r,
      label: regionLabel(t, r),
      clear: () => toggle(region, setRegion, r),
    });
  if (roomType)
    activeChips.push({ k: "roomType", label: roomLabel(roomType), clear: () => setRoomType(null) });
  if (bookableOnly)
    activeChips.push({
      k: "bookable",
      label: t("pill.bookableOnline"),
      clear: () => setBookableOnly(false),
    });
  for (const ty of type)
    activeChips.push({
      k: "type:" + ty,
      label: typeLabel(t, ty),
      clear: () => toggle(type, setType, ty),
    });
  if (warden)
    activeChips.push({ k: "warden", label: wardenLabel(t, warden), clear: () => setWarden(null) });
  for (const e of elev) {
    const band = ELEV_BANDS.find((b) => b.key === e);
    activeChips.push({
      k: "elev:" + e,
      label: band ? bandLabel(t, fmtN, band) : t("elev.unknown"),
      clear: () => toggle(elev, setElev, e),
    });
  }
  if (assoc) activeChips.push({ k: "assoc", label: assocLabel(assoc), clear: () => setAssoc(null) });
  if (showerOnly)
    activeChips.push({ k: "shower", label: t("tag.shower"), clear: () => setShowerOnly(false) });

  // EMPTY_STATE
  const shortenStay = () => {
    if (!to) return;
    const d = new Date(to + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > from) setTo(iso);
    else {
      setFrom("");
      setTo("");
    }
  };
  const blockers = [];
  if (nights.length)
    blockers.push(t("empty.nights", { count: nights.length, n: nights.length }));
  for (const c of activeChips) blockers.push(c.label);

  // UNBLOCKERS
  const elevLabel = (e) => {
    const b = ELEV_BANDS.find((x) => x.key === e);
    return b ? bandLabel(t, fmtN, b) : t("elev.unknown");
  };
  const filterCategories = [
    {
      skip: "region",
      on: region.length > 0,
      label: region.map((r) => regionLabel(t, r)).join(t("word.or")),
      clear: () => setRegion([]),
    },
    {
      skip: "type",
      on: type.length > 0,
      label: type.map((ty) => typeLabel(t, ty)).join(t("word.or")),
      clear: () => setType([]),
    },
    {
      skip: "elev",
      on: elev.length > 0,
      label: elev.map(elevLabel).join(t("word.or")),
      clear: () => setElev([]),
    },
    {
      skip: "warden",
      on: !!warden,
      label: wardenLabel(t, warden),
      clear: () => setWarden(null),
    },
    { skip: "assoc", on: !!assoc, label: assocLabel(assoc), clear: () => setAssoc(null) },
    { skip: "shower", on: showerOnly, label: t("tag.shower"), clear: () => setShowerOnly(false) },
    {
      skip: "bookable",
      on: bookableOnly,
      label: t("pill.bookableOnline"),
      clear: () => setBookableOnly(false),
    },
    {
      skip: "roomType",
      on: !!roomType,
      label: roomLabel(roomType),
      clear: () => setRoomType(null),
    },
    { skip: "query", on: !!query, label: t("chip.query", { q: query }), clear: () => setQuery("") },
  ];
  const unblockers =
    filtered.length === 0
      ? filterCategories
          .filter((c) => c.on)
          .map((c) => ({ ...c, n: huts.filter((h) => passes(h, c.skip)).length }))
          .filter((c) => c.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 2)
      : [];

  const visible = filtered.slice(0, RESULT_LIMIT);
  const hiddenCount = filtered.length - visible.length;
  const generated = avail && avail.generated ? fmtGenerated(avail.generated, locale) : null;

  const rangeLabel = from && to ? `${fmtISO(from)}–${fmtISO(to)}` : "";
  const nightsLabel = nights.length
    ? t("date.nights", { count: nights.length, n: nights.length })
    : "";

  /* rangeLabel is empty until check-out is chosen, and with the shared
     calendar that half-filled state is on screen for as long as it takes to
     pick the second date. */
  /* The count is split in two: the number people act on (countLead) carries
     the weight, the rest (countRest) stays quiet. With nothing narrowing the
     list it reads "1,524 huts", not "1524 of 1524 huts". countLine joins the
     two for the screen-reader announcement below. */
  const rangeTail = `${rangeLabel ? `, ${rangeLabel}` : ""} · ${nightsLabel}`;
  const allShown = filtered.length === huts.length;
  const [countLead, countRest] =
    status !== "ready"
      ? ["", ""]
      : nights.length
      ? roomType === ROOM_NONE
        ? [t("count.unlistedHuts", { n: fmtN(filtered.length) }), rangeTail]
        : [
            t("count.withSpace", { n: fmtN(matchCount) }),
            `${rangeTail}${
              unlistedCount > 0 ? t("count.unlistedTail", { n: fmtN(unlistedCount) }) : ""
            }`,
          ]
      : [
          allShown ? t("count.huts", { n: fmtN(huts.length) }) : fmtN(filtered.length),
          `${allShown ? "" : t("count.ofHuts", { n: fmtN(huts.length) })}${
            unlistedCount > 0
              ? matchCount > 0
                ? t("count.roomFirst", { n: fmtN(matchCount), rooms: bucketPlural(t, roomType) })
                : t("count.noneKnown", { rooms: bucketPlural(t, roomType) })
              : ""
          }`,
        ];
  const countLine = countLead + countRest;

  /* The count is the only thing a screen reader would notice changing when a
     filter is applied, so it is read out — but not on every keystroke. Typing
     "Hütte" into the search used to queue five counts in a row. This copy
     settles 700ms after the last change, and says "," where the screen shows
     "·", which some voices read aloud as "middle dot". */
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(countLine.replace(/ · /g, ", ")), 700);
    return () => clearTimeout(t);
  }, [countLine]);

  /* ----------------------------------------------------------------------
     Layout

     Desktop: a two-column grid. The left column carries the header, filters
     and list; the map takes column 2 and spans both rows, so it sticks to the
     top of the window at full height and runs to the right edge of the glass.

     Phone: one column. The map stage sits between the filters and the list
     and sticks to the top, carrying the view toggle with it — so the map and
     the controls stay on screen however far down the list you have scrolled.

     The map sits in the same place in the DOM either way; only its grid area
     changes. Crossing the breakpoint therefore never remounts Leaflet.
     ---------------------------------------------------------------------- */
  const wide = !isNarrow && showMap;

  const shellStyle = wide
    ? {
        display: "grid",
        gridTemplateColumns: "min(760px, 50%) 1fr",
        gridTemplateRows: "auto 1fr auto",
        width: "100%",
        fontFamily: "var(--font-ui)",
        textAlign: "left",
      }
    : {
        maxWidth: 720,
        margin: "0 auto",
        padding: isNarrow ? "1.25rem 1rem 0" : "2rem 1rem",
        fontFamily: "var(--font-ui)",
        textAlign: "left",
      };

  /* row 1 = header and filters, row 2 = the list, row 3 = the footer. All in
     grid column 1. Row 2 takes the slack, so in Map view (no list) the
     footer still sits at the foot of the column. */
  const leftCol = (row) =>
    wide
      ? {
          gridColumn: 1,
          gridRow: row,
          minWidth: 0,
          padding:
            row === 1 ? "2rem 1.75rem 0 2rem" : row === 2 ? "0 1.75rem 1.5rem 2rem" : "0 1.75rem 1.25rem 2rem",
        }
      : { minWidth: 0 };

  const stageStyle = wide
    ? { gridColumn: 2, gridRow: "1 / 4", minWidth: 0 }
    : {
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--cream)",
        margin: "0.75rem 0 0",
        padding: "0.5rem 0",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        /* No shadow under the bar. It used to mark cards passing behind it,
           but at rest it sat right on top of the hut count. The map's own
           border keeps the edge clear. */
      };

  /* One control, rendered next to the hut count on desktop and inside the
     pinned stage on a phone, where it has to stay reachable from anywhere. */
  const viewToggle = (
    <div
      role="group"
      aria-label={t("view.aria")}
      style={{
        display: "flex",
        gap: isNarrow ? 8 : 6,
        margin: 0,
      }}
    >
      {[
        ["list", t("view.list")],
        ["split", t("view.split")],
        ["map", t("view.map")],
      ].map(([k, label]) => (
        <button
          key={k}
          onClick={() => setView(k)}
          aria-pressed={view === k}
          className="hf-tap"
          style={{
            border: "1px solid var(--hair)",
            background: view === k ? "var(--ink)" : "transparent",
            color: view === k ? "#fff" : "var(--ink-soft)",
            borderRadius: 6,
            padding: isNarrow ? "0.6rem 0.8rem" : "0.3rem 0.8rem",
            minHeight: isNarrow ? 44 : undefined,
            flex: isNarrow ? "1 1 0" : undefined,
            fontFamily: "inherit",
            fontSize: isNarrow ? "0.9rem" : "0.82rem",
            fontWeight: isNarrow ? 600 : 400,
            cursor: "pointer",
            transition: "background var(--dur) var(--ease), color var(--dur) var(--ease)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  /* The hut count, as the visible heading of the results. It used to sit
     under the logo, a long way from the list it describes.
     Desktop: one row with List / Split / Map at the other end.
     Phone: the toggle lives in the pinned bar above the map, so the count
     stands alone, inset to line up with the hut names inside the cards
     (their 0.9rem padding plus the 1px border).
     Map view has no list, so the same bar closes the header instead. */
  const countHeading = (
    <h2
      style={{
        margin: 0,
        fontFamily: "var(--font-ui)",
        fontVariationSettings: "normal",
        fontSize: "0.97rem",
        lineHeight: 1.4,
        fontWeight: 600,
        color: "var(--ink)",
      }}
    >
      {countLead}
      {countRest ? (
        <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>{countRest}</span>
      ) : null}
    </h2>
  );
  const countBar = isNarrow ? (
    <div style={{ padding: showList ? "0.875rem 0 0 calc(0.9rem + 1px)" : 0 }}>
      {countHeading}
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem 0.75rem",
        marginTop: "0.25rem",
        paddingTop: "0.875rem",
        borderTop: "1px solid var(--hair)",
      }}
    >
      {countHeading}
      {viewToggle}
    </div>
  );

  /* Sits on the map rather than above it: a full-bleed map has no room above
     it, and the phone needs every pixel of height it can keep. */
  const legendCard = (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        maxWidth: "calc(100% - 20px)",
        /* Above Leaflet's control container (1000) as well, so the card still
           shows if the isolate in map.css ever stops applying. */
        zIndex: 1100,
        background: "rgba(251, 249, 244, 0.94)",
        border: "1px solid var(--hair)",
        borderRadius: 8,
        /* Trimmed on a phone, where the card was covering most of the map's
           width. The wording is the only thing that shortens — both pin types
           still have to be named, or the stone pins read as broken. */
        padding: isNarrow ? "0.28rem 0.45rem" : "0.45rem 0.6rem",
        display: "flex",
        gap: isNarrow ? "0.6rem" : "0.9rem",
        flexWrap: "wrap",
        fontSize: isNarrow ? "0.66rem" : "0.72rem",
        color: "var(--ink-soft)",
        pointerEvents: "none",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        <span
          style={{
            width: isNarrow ? 8 : 10,
            height: isNarrow ? 8 : 10,
            borderRadius: "50%",
            background: "var(--blue)",
            border: "1px solid #fff",
            boxShadow: "0 0 0 1px var(--hair)",
            flex: "0 0 auto",
          }}
        />
        {isNarrow ? t("legend.bookableShort") : t("legend.bookable")}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        <span
          style={{
            width: isNarrow ? 7 : 9,
            height: isNarrow ? 7 : 9,
            borderRadius: "50%",
            background: "var(--map-pin-muted)",
            opacity: 0.75,
            flex: "0 0 auto",
          }}
        />
        {isNarrow ? t("legend.contactShort") : t("legend.contact")}
      </span>
    </div>
  );

  const mapBox = (
    <div
      id="hut-map"
      /* In Map view there is no list, so the map is the page's main content
         and carries the main landmark — otherwise the page would have none,
         and the skip link would be pointing at nothing in particular. */
      role={showList ? "region" : "main"}
      aria-label={t("map.aria")}
      tabIndex={-1}
      style={{
        outline: "none",
        position: wide ? "sticky" : "relative",
        top: wide ? 0 : undefined,
        /* Leaflet's control container uses z-index 1000 internally. Giving the
           map its own stacking context contains those values, so they stay
           under the stage and the modal. */
        zIndex: 0,
        height: wide
          ? "100vh"
          : view === "map"
          ? "calc(100dvh - 9.5rem)"
          : /* Split on a phone. The cap matters as much as the vh: without it
               a tall phone gives the map so much height that the list below
               it is down to a card and a half. */
            "min(48vh, 380px)",
        border: wide ? "none" : "1px solid var(--hair)",
        borderLeft: wide ? "1px solid var(--hair)" : undefined,
        borderRadius: wide ? 0 : 12,
        overflow: "hidden",
      }}
    >
      {/* The pins are painted to a canvas, which is what keeps 1,500 of them
          smooth — and also means they are not elements and cannot take
          focus. Arrow keys pan and zoom the map itself; opening a hut is
          done from the list, which holds the same huts. Said out loud here
          so a screen reader isn't left guessing at an unlabelled canvas. */}
      <p className="hf-vh">{t("map.srNote")}</p>
      <MapPanel
        huts={filtered}
        onSelect={setSelected}
        selectedId={selected?.id ?? null}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        renderHoverCard={hutCard}
      />
      {legendCard}
    </div>
  );

  return (
    <div style={{ background: "var(--cream)", color: "var(--ink)", minHeight: "100vh", width: "100%" }}>
      {/* First stop in the tab order. Between the header and the first hut
          sit the search box, the calendar and around thirty filter pills —
          a long way to Tab through to reach the results, every time the
          page loads. In Map view there is no list to skip to, so it aims at
          the map instead. */}
      <a className="hf-skip" href={showList ? "#results" : "#hut-map"}>
        {showList ? t("skip.results") : t("skip.map")}
      </a>
      <div style={shellStyle}>
        <header style={leftCol(1)}>
        <h1 style={{ margin: "0 0 0.5rem" }}>
          <img
            src={`${import.meta.env.BASE_URL}h-line-600-light.svg`}
            alt="Hüttenfinder"
            style={{ height: 30, display: "block" }}
          />
        </h1>
        {/* What the site is, in a line: Austria only, and what you do here.
            About 280px at 16px, so it stays on one line on a 360px phone. */}
        <p style={{ color: "var(--ink-soft)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
          {t("site.tagline")}
        </p>
        <span className="hf-vh" role="status">{announced}</span>

        {status === "loading" && <p>{t("status.loading")}</p>}
        {status === "error" && (
          <p style={{ color: "var(--burgundy)" }}>
            {t("status.errorBefore")}
            <code>public</code>
            {t("status.errorAfter")}
          </p>
        )}

        {status === "ready" && (
          <>
            {/* The placeholder was the only label, and a placeholder vanishes
                the moment you type — including for anyone who needs to check
                what the field was for. */}
            <input
              type="text"
              id="hut-search"
              aria-label={t("search.aria")}
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="hf-tap-min"
              style={{
                width: "100%",
                padding: "0.6rem",
                fontSize: "1rem",
                marginBottom: "1rem",
                boxSizing: "border-box",
              }}
            />

            <FilterGroup label={t("filter.available")}>
              <DateRange
                from={from}
                to={to}
                maxNights={MAX_NIGHTS}
                isNarrow={isNarrow}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
              />
              {from && !avail && (
                <span style={{ color: "var(--burgundy)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                  {t("avail.notLoaded")}
                </span>
              )}
              {generated && (
                <div style={{ color: "var(--ink-soft)", fontSize: "0.72rem", marginTop: "0.35rem", width: "100%" }}>
                  {nights.length > 1 ? t("avail.nightsPrefix", { n: nights.length }) : ""}
                  {t("avail.asOf", { time: generated })}
                </div>
              )}
            </FilterGroup>


            <FilterGroup label={t("filter.region")}>
              <Pill active={!region.length} onClick={() => setRegion([])} label={t("pill.all")} />
              {presentRegions.map((r) => (
                <Pill
                  key={r}
                  active={region.includes(r)}
                  onClick={() => toggle(region, setRegion, r)}
                  label={regionLabel(t, r)}
                  count={regionCounts[r] || 0}
                />
              ))}
            </FilterGroup>

            {avail && (
              <FilterGroup label={t("filter.roomType")} note={t("filter.roomTypeNote")}>
                <Pill active={!roomType} onClick={() => setRoomType(null)} label={t("pill.any")} />
                {[...BUCKET_ORDER, ROOM_NONE].map((k) => (
                  <Pill
                    key={k}
                    active={roomType === k}
                    onClick={() => setRoomType(roomType === k ? null : k)}
                    label={k === ROOM_NONE ? t("pill.unlisted") : bucketLabel(t, k)}
                    count={roomTypeCounts[k] || 0}
                  />
                ))}
              </FilterGroup>
            )}

            <button
              ref={moreBtnRef}
              onClick={() => (showMore ? closeMore() : setShowMore(true))}
              aria-expanded={showMore}
              aria-controls="more-filters"
              className="hf-tap"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "transparent",
                border: "1px solid var(--line-control)",
                borderRadius: 100,
                color: "var(--ink)",
                padding: "0.45rem 0.95rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                marginBottom: "1rem",
              }}
            >
              {t("more.button")}
              {moreCount > 0 ? (
                <>
                  {/* The badge is a bare number on screen; spelled out for a
                      screen reader, where "More filters 3" says nothing. */}
                  <span
                    aria-hidden="true"
                    style={{
                      background: "var(--blue)",
                      color: "#fff",
                      borderRadius: 100,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.08rem 0.42rem",
                    }}
                  >
                    {moreCount}
                  </span>
                  <span className="hf-vh">
                    {t("more.applied", { count: moreCount, n: moreCount })}
                  </span>
                </>
              ) : null}
            </button>

            {/* ACTIVE_FILTER_CHIPS */}
            {anyNonDate ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                {activeChips.map((c) => (
                  <button
                    key={c.k}
                    onClick={c.clear}
                    aria-label={t("chip.removeAria", { label: c.label })}
                    className="hf-tap"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      background: "var(--powder-lt)",
                      border: "1px solid var(--powder)",
                      borderRadius: 100,
                      color: "var(--blue-deep)",
                      padding: "0.3rem 0.7rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                    <span aria-hidden="true" style={{ fontSize: "0.95rem", lineHeight: 1 }}>
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* MORE_FILTERS_PANEL */}
            {showMore ? (
              <div
                id="more-filters"
                ref={moreRef}
                /* On a phone this is a full-screen overlay and is announced as
                   one; on desktop the same markup is an inline panel, where
                   dialog semantics would be a lie. */
                role={isNarrow ? "dialog" : undefined}
                aria-modal={isNarrow ? true : undefined}
                aria-label={isNarrow ? t("more.button") : undefined}
                tabIndex={isNarrow ? -1 : undefined}
                style={
                  isNarrow
                    ? {
                        position: "fixed",
                        inset: 0,
                        zIndex: 1000,
                        background: "var(--cream)",
                        overflowY: "auto",
                        padding: "1rem 1rem 0",
                        outline: "none",
                        /* A column, so the Show button can sit at the bottom
                           of the screen even when the filters are short. */
                        display: "flex",
                        flexDirection: "column",
                      }
                    : {
                        border: "1px solid var(--hair)",
                        borderRadius: "var(--radius)",
                        background: "var(--card)",
                        padding: "1rem 1rem 0.2rem",
                        marginBottom: "1rem",
                      }
                }
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{t("more.button")}</span>
                  {isNarrow ? (
                    /* On a phone, Show N huts at the bottom closes the overlay;
                       this is the quiet way out. */
                    <button
                      onClick={closeMore}
                      aria-label={t("more.closeAria")}
                      className="hf-tap"
                      style={{
                        background: "transparent",
                        color: "var(--ink)",
                        border: "none",
                        padding: "0.35rem 0.6rem",
                        fontSize: "1.3rem",
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  ) : (
                    <button
                      onClick={closeMore}
                      className="hf-tap"
                      style={{
                        background: "var(--blue)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "var(--radius)",
                        padding: "0.5rem 1.1rem",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {t("more.done")}
                    </button>
                  )}
                </div>

            <FilterGroup label={t("filter.booking")}>
              <Pill
                active={bookableOnly}
                onClick={() => setBookableOnly(!bookableOnly)}
                label={t("pill.bookableOnline")}
                count={bookableCount}
              />
            </FilterGroup>

            <FilterGroup label={t("filter.type")}>
              <Pill active={!type.length} onClick={() => setType([])} label={t("pill.all")} />
              {["schutzhuette", "alm", "jausenstation"].map((ty) =>
                true ? (
                  <Pill
                    key={ty}
                    active={type.includes(ty)}
                    onClick={() => toggle(type, setType, ty)}
                    label={typeLabel(t, ty)}
                    count={typeCounts[ty] || 0}
                  />
                ) : null
              )}
            </FilterGroup>

            <FilterGroup label={t("filter.elevation")}>
              <Pill active={!elev.length} onClick={() => setElev([])} label={t("pill.all")} />
              {ELEV_BANDS.map((b) =>
                true ? (
                  <Pill
                    key={b.key}
                    active={elev.includes(b.key)}
                    onClick={() => toggle(elev, setElev, b.key)}
                    label={bandLabel(t, fmtN, b)}
                    count={elevCounts[b.key] || 0}
                  />
                ) : null
              )}
              {/* Every hut has an elevation today (some estimated), so this
                  only appears if the data ever has gaps again. */}
              {elevCounts[ELEV_UNKNOWN] > 0 || elev.includes(ELEV_UNKNOWN) ? (
                <Pill
                  active={elev.includes(ELEV_UNKNOWN)}
                  onClick={() => toggle(elev, setElev, ELEV_UNKNOWN)}
                  label={t("elev.unknown")}
                  count={elevCounts[ELEV_UNKNOWN] || 0}
                />
              ) : null}
            </FilterGroup>

            <FilterGroup label={t("filter.warden")}>
              <Pill active={!warden} onClick={() => setWarden(null)} label={t("pill.all")} />
              {["bewirtschaftet", "selbstversorger"].map((w) =>
                true ? (
                  <Pill
                    key={w}
                    active={warden === w}
                    onClick={() => setWarden(warden === w ? null : w)}
                    label={wardenLabel(t, w)}
                    count={wardenCounts[w] || 0}
                  />
                ) : null
              )}
            </FilterGroup>

            <FilterGroup label={t("filter.association")}>
              <Pill active={!assoc} onClick={() => setAssoc(null)} label={t("pill.all")} />
              {["alpine_club", "naturfreunde", "private", "unknown"].map((a) => (
                <Pill
                  key={a}
                  active={assoc === a}
                  onClick={() => setAssoc(assoc === a ? null : a)}
                  label={a === "unknown" ? t("pill.unlisted") : assocName(t, a)}
                  count={assocCounts[a] || 0}
                />
              ))}
            </FilterGroup>

            <FilterGroup label={t("filter.amenities")}>
              <Pill
                active={showerOnly}
                onClick={() => setShowerOnly(!showerOnly)}
                label={t("pill.hasShower")}
                count={showerCount}
              />
            </FilterGroup>

            {isNarrow ? (
              /* The result count on the button, so the number people act on
                 is the one they tap. Clear only resets what is in this panel. */
              <div
                style={{
                  position: "sticky",
                  bottom: 0,
                  marginTop: "auto",
                  marginInline: "-1rem",
                  padding: "0.75rem 1rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  background: "var(--cream)",
                  borderTop: "1px solid var(--hair)",
                  boxShadow: "0 -8px 12px -10px rgba(58, 42, 32, 0.22)",
                }}
              >
                {moreCount > 0 ? (
                  <button
                    onClick={() => {
                      setBookableOnly(false);
                      setType([]);
                      setElev([]);
                      setWarden(null);
                      setAssoc(null);
                      setShowerOnly(false);
                    }}
                    className="hf-tap"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--ink)",
                      textDecoration: "underline",
                      fontSize: "0.9rem",
                      padding: "0 0.25rem",
                      cursor: "pointer",
                    }}
                  >
                    {t("more.clear")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={closeMore}
                  className="hf-tap"
                  style={{
                    flexGrow: 1,
                    maxWidth: 240,
                    background: "var(--blue)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius)",
                    padding: "0.8rem 1rem",
                    fontSize: "0.97rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("more.show", { count: filtered.length, n: fmtN(filtered.length) })}
                </button>
              </div>
            ) : null}
              </div>
            ) : null}

            {anyFilter && (
              <button
                onClick={clearAll}
                className="hf-tap"
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--ink-soft)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: 0,
                  marginBottom: "1.25rem",
                }}
              >
                {t("clear.filters")}
              </button>
            )}
            {!showList && countBar}
          </>
        )}
        </header>

        {/* The map stage. On a phone it is rendered even in List view, because
            it carries the toggle — without it you would be stranded in the
            list with no way back to the map. */}
        {status === "ready" && (isNarrow || showMap) && (
          <div style={stageStyle}>
            {isNarrow && (
              /* A landmark of its own: on a phone this bar is pinned above
                 everything and is how you move around the page, so it should
                 not be loose content sitting outside every landmark. */
              <nav
                aria-label={t("view.aria")}
                style={{ display: "flex", gap: 8, alignItems: "stretch" }}
              >
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>{viewToggle}</div>
                {scrolledDown && (
                  <button
                    onClick={scrollToTop}
                    aria-label={t("top.aria")}
                    title={t("top.title")}
                    style={{
                      flex: "0 0 44px",
                      minHeight: 44,
                      border: "1px solid var(--line-control)",
                      background: "transparent",
                      color: "var(--ink)",
                      borderRadius: 6,
                      fontFamily: "inherit",
                      fontSize: "1.05rem",
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                )}
              </nav>
            )}
            {showMap && mapBox}
          </div>
        )}

        {/* The results are the page's main content and the skip link's
            target. tabIndex -1 is what lets focus actually land here —
            browsers move focus to a fragment target only if it can hold
            it — so the next Tab continues from the first hut, not from the
            top of the filters again. */}
        {status === "ready" && showList && (
          <main id="results" tabIndex={-1} style={leftCol(2)}>
            {countBar}
            {filtered.length === 0 ? (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.5rem 1.35rem",
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--radius)",
                  background: "var(--card)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem" }}>
                  {from && !avail
                    ? t("empty.noAvail")
                    : nights.length > 1
                    ? t("empty.nothingFreeNights", { n: nights.length })
                    : nights.length === 1
                    ? t("empty.nothingFreeNight")
                    : t("empty.noMatch")}
                </p>
                <p style={{ margin: "0.5rem 0 0", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                  {from && !avail
                    ? t("empty.noAvailNote")
                    : blockers.length
                    ? t("empty.searchingFor", { list: blockers.join(" · ") })
                    : t("empty.nothingToShow")}
                </p>
                {from && !avail ? null : (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.15rem" }}>
                    {nights.length > 1 ? (
                      <button onClick={shortenStay} className="hf-tap" style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                        {nights.length === 2
                          ? t("empty.tryOneNight")
                          : t("empty.tryNights", { n: nights.length - 1 })}
                      </button>
                    ) : null}
                    {unblockers.map((u) => (
                      <button key={u.skip} onClick={u.clear} className="hf-tap" style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line-control)", borderRadius: "var(--radius)", padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}>
                        {t("empty.drop", { count: u.n, label: u.label, n: u.n })}
                      </button>
                    ))}
                    {anyNonDate ? (
                      <button onClick={clearAll} className="hf-tap" style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line-control)", borderRadius: "var(--radius)", padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}>
                        {t("clear.filters")}
                      </button>
                    ) : null}
                    {from ? (
                      <button
                        onClick={() => {
                          setFrom("");
                          setTo("");
                        }}
                        className="hf-tap"
                        style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line-control)", borderRadius: "var(--radius)", padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}
                      >
                        {t("clear.dates")}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <ul
                className="hf-cards"
                style={{ listStyle: "none", padding: 0, margin: isNarrow ? "0.625rem 0 0" : "0.875rem 0 0" }}
              >
                {visible.map((hut, i) => (
                  <Fragment key={hut.id}>
                  {splitUnlisted && i === matchCount ? (
                    /* Where the huts known to match end and the unlisted
                       ones (no room types or availability online) begin. */
                    <li
                      style={{
                        gridColumn: "1 / -1",
                        padding: "1.1rem 0.1rem 0.2rem",
                        marginTop: i > 0 ? "0.35rem" : 0,
                        borderTop: i > 0 ? "1px solid var(--hair)" : "none",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontFamily: "var(--font-ui)",
                          fontVariationSettings: "normal",
                          fontSize: "1rem",
                          lineHeight: 1.4,
                          fontWeight: 700,
                        }}
                      >
                        {t("unlisted.heading", { count: unlistedCount, n: fmtN(unlistedCount) })}
                      </h3>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", lineHeight: 1.5, color: "var(--ink-soft)" }}>
                        {nights.length
                          ? sortByRoom
                            ? t("unlisted.noteDatesRoom", { rooms: bucketPlural(t, roomType) })
                            : t("unlisted.noteDates")
                          : t("unlisted.noteRoom", { rooms: bucketPlural(t, roomType) })}
                      </p>
                    </li>
                  ) : null}
                  {/* The card used to be one big role="button" with links
                     inside it — a button whose name was the entire card, and
                     which is not allowed to contain links. The hut name now
                     carries the button; clicking anywhere on the card still
                     opens it, for a mouse. */}
                  <li
                    onMouseEnter={() => setHoveredId(hut.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelected(hut)}
                    className={`hf-hutcard${hoveredId === hut.id ? " is-lit" : ""}`}
                  >
                    {hutCard(hut, () => setSelected(hut))}
                  </li>
                  </Fragment>
                ))}
              </ul>
            )}

            {hiddenCount > 0 && (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {t("list.showingFirst", { limit: RESULT_LIMIT, n: fmtN(hiddenCount) })}
              </p>
            )}

            <p style={{ color: "var(--ink-soft)", fontSize: "0.75rem", marginTop: "1.5rem" }}>
              {t("list.elevationNote")}
            </p>
            {isNarrow && (
              <button
                onClick={() =>
                  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" })
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 44,
                  padding: "0 1rem",
                  marginTop: "0.5rem",
                  border: "1px solid var(--line-control)",
                  borderRadius: "var(--radius)",
                  background: "transparent",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("list.backToFilters")}
              </button>
            )}
          </main>
        )}

        {/* Imprint and privacy, in every view and while loading, so they are
            always one click away. The OSM credit is here because the list
            shows OSM data even when no map (and so no map attribution) is on
            screen. The legal pages are plain HTML: imprint/ and privacy/. */}
        <footer
          style={
            wide
              ? leftCol(3)
              : { minWidth: 0, margin: "1.5rem 0 0", padding: isNarrow ? "0 0 1.25rem" : 0 }
          }
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: "1rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--hair)",
              fontSize: "var(--t-label)",
              lineHeight: "var(--lh-label)",
              color: "var(--ink-soft)",
            }}
          >
            <a className="hf-tap" href={`${import.meta.env.BASE_URL}imprint/`} style={{ color: "inherit" }}>
              {t("footer.imprint")}
            </a>
            <a className="hf-tap" href={`${import.meta.env.BASE_URL}privacy/`} style={{ color: "inherit" }}>
              {t("footer.privacy")}
            </a>
            <span>
              {t("footer.osmBefore")}{" "}
              <a href="https://www.openstreetmap.org/copyright" style={{ color: "inherit" }}>
                OpenStreetMap
              </a>{" "}
              {t("footer.osmAfter")}
            </span>
          </div>
        </footer>

        {status === "ready" && selected && (
  <div
    onClick={closeModal}
    style={{
      position: "fixed",
      inset: 0,
      background: modalOpen ? "rgba(20,18,14,0.45)" : "rgba(20,18,14,0)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      zIndex: 2000,
      transition: "background-color var(--dur) var(--ease)",
    }}
  >
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={selected.name}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "var(--card)",
        borderRadius: 12,
        /* The photo runs to the edges, so the padding lives in hutDetail. */
        padding: 0,
        width: "100%",
        maxWidth: 420,
        maxHeight: "80vh",
        overflowY: "auto",
        position: "relative",
        outline: "none",
        opacity: modalOpen ? 1 : 0,
        transform: modalOpen ? "translateY(0)" : "translateY(8px)",
        transition: "opacity var(--dur) var(--ease), transform var(--dur) var(--ease)",
      }}
    >
      <button
        onClick={closeModal}
        /* "Close" alone is ambiguous once there are two overlays that close.
           The glyph is hidden so the label is all that's read. */
        aria-label={t("detail.closeAria", { hut: selected.name })}
        className="hf-close"
        style={{
          position: "absolute",
          top: "0.6rem",
          right: "0.7rem",
          border: "none",
          /* On top of a photo it needs its own backing to stay readable. */
          background: photos[selected.id] ? "var(--card)" : "none",
          borderRadius: photos[selected.id] ? "50%" : 0,
          color: photos[selected.id] ? "var(--ink)" : "var(--ink-soft)",
          fontSize: "1.3rem",
          lineHeight: 1,
          cursor: "pointer",
          padding: "0.2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
      {hutDetail(selected)}
    </div>
  </div>
)}
      </div>
    </div>
  );
}
