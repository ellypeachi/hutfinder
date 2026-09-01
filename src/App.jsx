import { useEffect, useState } from "react";
import MapPanel from "./MapPanel";
const TYPE_LABEL = {
  schutzhuette: "Schutzhütte",
  alm: "Alm",
  jausenstation: "Jausenstation",
};

const WARDEN_LABEL = {
  bewirtschaftet: "Serviced",
  selbstversorger: "Self-service",
};

const ASSOC_LABEL = {
  alpine_club: "Alpine club",
  private: "Private",
};

const CLUB_LABEL = {
  OEAV: "ÖAV",
  DAV: "DAV",
  AVS: "AVS",
  alpGesPreintaler: "Alpengesellschaft Preintaler",
};

// Room-type buckets — snapshot arrays are ordered [dorm, shared, private]
const BUCKET_LABEL = { dorm: "Dormitory", shared: "Shared room", priv: "Private room" };
const BUCKET_ORDER = ["dorm", "shared", "priv"];
const BUCKET_IDX = { dorm: 0, shared: 1, priv: 2 };

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
  { key: "e1", label: "< 1,000 m", lo: -Infinity, hi: 1000 },
  { key: "e2", label: "1,000–1,500 m", lo: 1000, hi: 1500 },
  { key: "e3", label: "1,500–2,000 m", lo: 1500, hi: 2000 },
  { key: "e4", label: "2,000–2,500 m", lo: 2000, hi: 2500 },
  { key: "e5", label: "2,500 m +", lo: 2500, hi: Infinity },
];
const ELEV_UNKNOWN = "unknown";

const RESULT_LIMIT = 300;
const MAX_NIGHTS = 31;

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
  if (n <= 0) return "#c0392b";
  if (n <= 3) return "#c98a00";
  return "#1a7f4b";
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
function fmtGenerated(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
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

function Dot({ color }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: 9,
        background: color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

function Pill({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? "1px solid #1a1a1a" : "1px solid #dcdcdc",
        background: active ? "#1a1a1a" : "#fff",
        color: active ? "#fff" : "#333",
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
        <span style={{ opacity: active ? 0.6 : 0.45, marginLeft: "0.4rem" }}>{count}</span>
      )}
    </button>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div
        style={{
          fontSize: "0.7rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#999",
          marginBottom: "0.45rem",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>{children}</div>
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
  const [huts, setHuts] = useState([]);
  const [avail, setAvail] = useState(null);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState(null);
  const [type, setType] = useState(null);
  const [warden, setWarden] = useState(null);
  const [elev, setElev] = useState(null);
  const [assoc, setAssoc] = useState(null);
  const [showerOnly, setShowerOnly] = useState(false);
  const [bookableOnly, setBookableOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [roomType, setRoomType] = useState(null); // "dorm" | "shared" | "priv" | null
  const [view, setView] = useState("split");
  const [selected, setSelected] = useState(null);
    const isNarrow = useIsNarrow();
      useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const showMap = isNarrow || view !== "list";
  const showList = isNarrow || view !== "map";
  useEffect(() => {
    fetch("/huts.json")
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then((data) => {
        setHuts(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    fetch("/availability.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAvail(data))
      .catch(() => setAvail(null));
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
  const hutCardBody = (hut) => {
    const rec = recOf(hut);
    const nf = !nights.length ? nextFree(hut) : null;
    const mins = nights.length ? minBuckets(hut) : null;
    return (
      <>
        <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{hut.name}</div>
        <div style={{ color: "#555", fontSize: "0.9rem", marginTop: "0.2rem" }}>
          {TYPE_LABEL[hut.type] || hut.type}
          {hut.region ? ` · ${hut.region}` : ""}
          {isNumber(hut.elevation)
            ? ` · ${hut.elevation} m${hut.elevation_estimated ? "*" : ""}`
            : ""}
        </div>
        <div style={{ color: "#777", fontSize: "0.85rem", marginTop: "0.35rem" }}>
          {isNumber(hut.hr_capacity)
            ? `${hut.hr_capacity} beds`
            : hut.sleeping > 0
            ? `${hut.sleeping} beds`
            : "no overnight"}
          {" · "}
          {hut.warden === "bewirtschaftet"
            ? "serviced"
            : hut.warden === "selbstversorger"
            ? "self-service"
            : "warden unknown"}
          {hut.association ? ` · ${ASSOC_LABEL[hut.association] || hut.association}` : ""}
          {hut.shower === true ? " · shower" : ""}
          {hut.website ? (
            <>
              {" · "}
              <a href={hut.website} target="_blank" rel="noreferrer">
                website
              </a>
            </>
          ) : null}
        </div>

        {hut.hr_hut_id ? (
          <div
            style={{
              marginTop: "0.6rem",
              paddingTop: "0.55rem",
              borderTop: "1px solid #eee",
              fontSize: "0.85rem",
              color: "#555",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem" }}>
              <a
                href={hut.hr_booking_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#1a7f4b",
                  color: "#fff",
                  textDecoration: "none",
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  whiteSpace: "nowrap",
                }}
              >
                Book online →
              </a>
              <span>
                {hut.club ? CLUB_LABEL[hut.club] || hut.club : null}
                {isNumber(hut.hr_half_board_eur) ? ` · half board €${hut.hr_half_board_eur}` : ""}
                {hut.hr_dogs === true ? " · dogs welcome" : hut.hr_dogs === false ? " · no dogs" : ""}
              </span>
              {hut.hr_price_pdf ? (
                <a href={hut.hr_price_pdf} target="_blank" rel="noreferrer" style={{ color: "#888" }}>
                  price list
                </a>
              ) : null}
            </div>

            {avail ? (
              <div style={{ marginTop: "0.5rem" }}>
                {nights.length && mins && rec && rec.caps ? (
                  <>
                    <div style={{ color: "#888", fontSize: "0.78rem", marginBottom: "0.25rem" }}>
                      Free {rangeLabel}
                      {nights.length > 1 ? " · fewest across your nights" : ""}
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
                          <span style={{ color: "#666" }}>
                            <Dot color={bedColor(n)} />
                            {BUCKET_LABEL[k]}
                          </span>
                          <span style={{ color: n > 0 ? "#1a1a1a" : "#bbb", fontWeight: 500 }}>
                            {n} {n === 1 ? "bed" : "beds"}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : nf ? (
                  <span style={{ color: "#666" }}>
                    <Dot color="#1a7f4b" />
                    Next free: {fmtISO(nf.date)} ({nf.free} beds)
                  </span>
                ) : rec ? (
                  <span style={{ color: "#aaa" }}>No open dates in the next months</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  };
  const regionOf = (h) => h.region || "Other/Unknown";

  const passes = (h, skip) => {
    if (skip !== "query" && query && !h.name.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (skip !== "region" && region && regionOf(h) !== region) return false;
    if (skip !== "type" && type && h.type !== type) return false;
    if (skip !== "warden" && warden && h.warden !== warden) return false;
    if (skip !== "elev" && elev && bandOf(h) !== elev) return false;
    if (skip !== "assoc" && assoc && h.association !== assoc) return false;
    if (skip !== "shower" && showerOnly && h.shower !== true) return false;
    if (skip !== "bookable" && bookableOnly && !h.hr_hut_id) return false;

    // date filter: every requested night must be open with at least one free bed
    if (nights.length) {
      const rec = recOf(h);
      if (!rec) return false;
      for (const d of nights) {
        const a = nightArr(rec, d);
        if (!a || (a[0] || 0) + (a[1] || 0) + (a[2] || 0) <= 0) return false;
      }
    }

    // room-type filter: with a date, that bucket must be free every night;
    // without a date, the hut must simply offer that room type
    if (skip !== "roomType" && roomType) {
      const rec = recOf(h);
      if (!rec) return false;
      const idx = BUCKET_IDX[roomType];
      if (nights.length) {
        for (const d of nights) {
          const a = nightArr(rec, d);
          if (!a || !(a[idx] > 0)) return false;
        }
      } else if (!(rec.caps && rec.caps[idx] > 0)) {
        return false;
      }
    }
    return true;
  };

  const filtered = huts.filter((h) => passes(h));

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
  const wardenCounts = facet("warden", (h) => h.warden);
  const elevCounts = facet("elev", bandOf);
  const assocCounts = facet("assoc", (h) => h.association || "unknown");
  const showerCount = huts.filter((h) => passes(h, "shower") && h.shower === true).length;
  const bookableCount = huts.filter((h) => passes(h, "bookable") && h.hr_hut_id).length;

  // room-type counts: a hut can offer several types, so count each bucket it qualifies for
  const roomTypeCounts = { dorm: 0, shared: 0, priv: 0 };
  if (avail) {
    for (const h of huts) {
      if (!passes(h, "roomType")) continue;
      const rec = recOf(h);
      if (!rec) continue;
      for (const k of BUCKET_ORDER) {
        const idx = BUCKET_IDX[k];
        let okB;
        if (nights.length) {
          okB = true;
          for (const d of nights) {
            const a = nightArr(rec, d);
            if (!a || !(a[idx] > 0)) {
              okB = false;
              break;
            }
          }
        } else {
          okB = rec.caps && rec.caps[idx] > 0;
        }
        if (okB) roomTypeCounts[k]++;
      }
    }
  }

  const presentRegions = REGION_ORDER.filter((r) => regionCounts[r] > 0).concat(
    Object.keys(regionCounts)
      .filter((r) => !REGION_ORDER.includes(r) && regionCounts[r] > 0)
      .sort()
  );

  const anyFilter =
    region || type || warden || elev || assoc || showerOnly || bookableOnly || from || roomType || query;
  const clearAll = () => {
    setRegion(null);
    setType(null);
    setWarden(null);
    setElev(null);
    setAssoc(null);
    setShowerOnly(false);
    setBookableOnly(false);
    setFrom("");
    setTo("");
    setRoomType(null);
    setQuery("");
  };

  const visible = filtered.slice(0, RESULT_LIMIT);
  const hiddenCount = filtered.length - visible.length;
  const generated = avail && avail.generated ? fmtGenerated(avail.generated) : null;

  const rangeLabel =
    nights.length === 1
      ? `on ${fmtISO(nights[0])}`
      : nights.length > 1
      ? `every night ${fmtISO(nights[0])}–${fmtISO(nights[nights.length - 1])}`
      : "";

  return (
    <div style={{ background: "#fff", color: "#1a1a1a", minHeight: "100vh", width: "100%" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "2rem 1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "left",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>Hüttenfinder</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          {status === "ready"
            ? nights.length
              ? `${filtered.length} huts with space ${rangeLabel}`
              : `${filtered.length} of ${huts.length} huts`
            : ""}
        </p>

        {status === "loading" && <p>Loading huts…</p>}
        {status === "error" && (
          <p style={{ color: "#c00" }}>
            Couldn't load huts.json — check it's in the <code>public</code> folder.
          </p>
        )}

        {status === "ready" && (
          <>
            <input
              type="text"
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem",
                fontSize: "1rem",
                marginBottom: "1rem",
                boxSizing: "border-box",
              }}
            />

            <FilterGroup label="Available (nights)">
              <label style={{ fontSize: "0.8rem", color: "#777", marginRight: "0.35rem" }}>
                Check in
              </label>
              <input
                type="date"
                value={from}
                min={todayISO()}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (to && to <= e.target.value) setTo("");
                }}
                style={{
                  padding: "0.45rem 0.55rem",
                  fontSize: "0.95rem",
                  border: "1px solid #cdd8d2",
                  borderRadius: 6,
                  marginRight: "0.6rem",
                }}
              />
              <label style={{ fontSize: "0.8rem", color: "#777", marginRight: "0.35rem" }}>
                Check out
              </label>
              <input
                type="date"
                value={to}
                min={from ? nextDayISO(from) : todayISO()}
                disabled={!from}
                onChange={(e) => setTo(e.target.value)}
                style={{
                  padding: "0.45rem 0.55rem",
                  fontSize: "0.95rem",
                  border: "1px solid #cdd8d2",
                  borderRadius: 6,
                  marginRight: "0.5rem",
                  opacity: from ? 1 : 0.5,
                }}
              />
              {from && (
                <button
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#777",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  clear
                </button>
              )}
              {from && !avail && (
                <span style={{ color: "#c0392b", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                  availability.json didn’t load — run fetch_availability.py
                </span>
              )}
              {generated && (
                <div style={{ color: "#aaa", fontSize: "0.72rem", marginTop: "0.35rem", width: "100%" }}>
                  {nights.length > 1 ? `${nights.length} nights · ` : ""}availability as of {generated}
                </div>
              )}
            </FilterGroup>

            {avail && (
              <FilterGroup label="Room type">
                <Pill active={!roomType} onClick={() => setRoomType(null)} label="Any" />
                {BUCKET_ORDER.map((k) =>
                  roomTypeCounts[k] > 0 || roomType === k ? (
                    <Pill
                      key={k}
                      active={roomType === k}
                      onClick={() => setRoomType(roomType === k ? null : k)}
                      label={BUCKET_LABEL[k]}
                      count={roomTypeCounts[k] || 0}
                    />
                  ) : null
                )}
              </FilterGroup>
            )}

            <FilterGroup label="Booking">
              <Pill
                active={bookableOnly}
                onClick={() => setBookableOnly(!bookableOnly)}
                label="Bookable online"
                count={bookableCount}
              />
            </FilterGroup>

            <FilterGroup label="Region">
              <Pill active={!region} onClick={() => setRegion(null)} label="All" />
              {presentRegions.map((r) => (
                <Pill
                  key={r}
                  active={region === r}
                  onClick={() => setRegion(region === r ? null : r)}
                  label={r}
                  count={regionCounts[r] || 0}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Type">
              <Pill active={!type} onClick={() => setType(null)} label="All" />
              {["schutzhuette", "alm", "jausenstation"].map((t) =>
                typeCounts[t] > 0 || type === t ? (
                  <Pill
                    key={t}
                    active={type === t}
                    onClick={() => setType(type === t ? null : t)}
                    label={TYPE_LABEL[t] || t}
                    count={typeCounts[t] || 0}
                  />
                ) : null
              )}
            </FilterGroup>

            <FilterGroup label="Elevation">
              <Pill active={!elev} onClick={() => setElev(null)} label="All" />
              {ELEV_BANDS.map((b) =>
                elevCounts[b.key] > 0 || elev === b.key ? (
                  <Pill
                    key={b.key}
                    active={elev === b.key}
                    onClick={() => setElev(elev === b.key ? null : b.key)}
                    label={b.label}
                    count={elevCounts[b.key] || 0}
                  />
                ) : null
              )}
              {elevCounts[ELEV_UNKNOWN] > 0 || elev === ELEV_UNKNOWN ? (
                <Pill
                  active={elev === ELEV_UNKNOWN}
                  onClick={() => setElev(elev === ELEV_UNKNOWN ? null : ELEV_UNKNOWN)}
                  label="Elevation unknown"
                  count={elevCounts[ELEV_UNKNOWN] || 0}
                />
              ) : null}
            </FilterGroup>

            <FilterGroup label="Warden">
              <Pill active={!warden} onClick={() => setWarden(null)} label="All" />
              {["bewirtschaftet", "selbstversorger"].map((w) =>
                wardenCounts[w] > 0 || warden === w ? (
                  <Pill
                    key={w}
                    active={warden === w}
                    onClick={() => setWarden(warden === w ? null : w)}
                    label={WARDEN_LABEL[w] || w}
                    count={wardenCounts[w] || 0}
                  />
                ) : null
              )}
            </FilterGroup>

            <FilterGroup label="Association">
              <Pill active={!assoc} onClick={() => setAssoc(null)} label="All" />
              {["alpine_club", "private"].map((a) =>
                assocCounts[a] > 0 || assoc === a ? (
                  <Pill
                    key={a}
                    active={assoc === a}
                    onClick={() => setAssoc(assoc === a ? null : a)}
                    label={ASSOC_LABEL[a] || a}
                    count={assocCounts[a] || 0}
                  />
                ) : null
              )}
            </FilterGroup>

            <FilterGroup label="Amenities">
              <Pill
                active={showerOnly}
                onClick={() => setShowerOnly(!showerOnly)}
                label="Has shower"
                count={showerCount}
              />
            </FilterGroup>

            {anyFilter && (
              <button
                onClick={clearAll}
                style={{
                  border: "none",
                  background: "none",
                  color: "#777",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: 0,
                  marginBottom: "1.25rem",
                }}
              >
                Clear all filters
              </button>
            )}
            {!isNarrow && (
              <div style={{ display: "flex", gap: 6, margin: "1.25rem 0 0" }}>
                {[
                  ["list", "List"],
                  ["split", "Split"],
                  ["map", "Map"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setView(k)}
                    style={{
                      border: "1px solid #e2e2e2",
                      background: view === k ? "#1a1a1a" : "transparent",
                      color: view === k ? "#fff" : "#777",
                      borderRadius: 6,
                      padding: "0.3rem 0.8rem",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: isNarrow ? "column-reverse" : "row",
                gap: isNarrow ? "0.75rem" : "1.5rem",
                alignItems: "flex-start",
                marginTop: "1rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, width: "100%", display: showList ? "block" : "none" }}>
            {filtered.length === 0 ? (
              <p style={{ color: "#777", marginTop: "1.5rem" }}>
                {nights.length
                  ? `No bookable huts with space ${rangeLabel} match these filters.`
                  : "No huts match these filters."}{" "}
                <button
                  onClick={clearAll}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#1a1a1a",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: "inherit",
                    padding: 0,
                  }}
                >
                  Clear
                </button>
                .
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}>
                {visible.map((hut) => (
                  <li
                    key={hut.id}
                    style={{
                      border: "1px solid #e2e2e2",
                      borderRadius: 8,
                      padding: "0.9rem 1rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {hutCardBody(hut)}
                  </li>
                ))}
              </ul>
            )}

            {hiddenCount > 0 && (
              <p style={{ color: "#999", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Showing the first {RESULT_LIMIT} — narrow the filters to see the other {hiddenCount}.
              </p>
            )}

            <p style={{ color: "#bbb", fontSize: "0.75rem", marginTop: "1.5rem" }}>
              * elevation estimated from coordinates
            </p>
                          </div>

              {showMap && (
                <div
                  style={{
                    flex: isNarrow ? "none" : "0 0 44%",
                    width: "100%",
                    position: isNarrow ? "relative" : "sticky",
                    top: isNarrow ? undefined : "1rem",
                    height: isNarrow ? "48vh" : "74vh",
                    border: "1px solid #e2e2e2",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <MapPanel huts={filtered} onSelect={setSelected} />
                </div>
              )}
            </div>
                        {selected && (
              <div
                onClick={() => setSelected(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(20,18,14,0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1rem",
                  zIndex: 2000,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "1.25rem 1.4rem",
                    width: "100%",
                    maxWidth: 420,
                    maxHeight: "80vh",
                    overflowY: "auto",
                    position: "relative",
                  }}
                >
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    style={{
                      position: "absolute",
                      top: "0.6rem",
                      right: "0.7rem",
                      border: "none",
                      background: "none",
                      color: "#999",
                      fontSize: "1.3rem",
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: "0.2rem",
                    }}
                  >
                    ×
                  </button>
                  {hutCardBody(selected)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
