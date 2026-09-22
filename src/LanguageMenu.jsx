import { useEffect, useRef, useState } from "react";
import { LANGS, useI18n } from "./i18n";

/* The language control: a globe and the current code in the header, and the
   list only once you ask for it. The full list sits behind a tap because
   five codes across the top is five things to read before the huts, and on a
   phone they don't fit beside the wordmark anyway.

   The trigger has no border, unlike the other controls in the house style.
   The globe is what marks it as a control; a bordered pill next to the
   wordmark reads as a second logo. */

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ marginLeft: "auto", flexShrink: 0 }}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function LanguageMenu() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  /* Closing always hands focus back to the trigger: the list is gone, and
     without this the next Tab would start again at the top of the page. */
  const close = () => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    /* A tap anywhere else closes it — but not one inside the list or on the
       trigger, which has its own toggle. */
    const onDown = (e) => {
      if (listRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // One language, nothing to switch between.
  if (LANGS.length < 2) return null;

  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        /* The code alone ("EN") says nothing out loud, so the label carries
           the language's name. */
        aria-label={t("lang.aria", { name: current.name })}
        className="hf-tap"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.35rem",
          padding: "0 0.35rem",
          marginRight: "-0.35rem",
          border: 0,
          background: "transparent",
          color: open ? "var(--ink)" : "var(--ink-soft)",
          fontFamily: "inherit",
          fontSize: "0.85rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "pointer",
        }}
      >
        <GlobeIcon />
        <span aria-hidden="true">{current.label}</span>
      </button>

      {open ? (
        <ul
          ref={listRef}
          aria-label={t("lang.label")}
          style={{
            position: "absolute",
            top: "calc(100% + 0.35rem)",
            right: 0,
            zIndex: 50,
            width: 200,
            margin: 0,
            padding: "0.35rem 0",
            listStyle: "none",
            background: "var(--card)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(58, 42, 32, 0.14)",
          }}
        >
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                lang={l.code}
                aria-current={l.code === lang ? "true" : undefined}
                onClick={() => {
                  setLang(l.code);
                  close();
                }}
                className="hf-tap"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  width: "100%",
                  minHeight: 38,
                  padding: "0 0.875rem",
                  border: 0,
                  background: l.code === lang ? "var(--cream)" : "transparent",
                  textAlign: "left",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: "var(--ink-soft)",
                  }}
                >
                  {l.label}
                </span>
                <span
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--ink)",
                    fontWeight: l.code === lang ? 600 : 400,
                  }}
                >
                  {l.name}
                </span>
                {l.code === lang ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
