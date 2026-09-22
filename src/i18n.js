import { createContext, useContext } from "react";
import { en } from "./strings/en";
import { de } from "./strings/de";
import { nl } from "./strings/nl";
import { fr } from "./strings/fr";
import { cs } from "./strings/cs";

/* ==========================================================================
   i18n

   Every visible string lives in src/strings/<code>.js under the same key.
   Components read them through useI18n():

     const { t, nf } = useI18n();
     t("pill.all")                       -> "All"
     t("avail.beds", { count: 3, n: 3 }) -> "3 beds"   (plural via Intl)
     nf(1524)                            -> "1,524"    (separator per locale)

   A key the active language is missing falls back to English rather than
   disappearing, so a half-finished translation still renders a whole page.

   No translation library: the whole mechanism is this file. Numbers, dates,
   month names and plural forms come from the browser's own Intl, which is
   why German gets "1.524" and "Jänner" (de-AT, not de-DE) for free.
   ========================================================================== */

// Languages the site offers, in the order the switcher lists them. A language
// appears here only once its strings file exists.
export const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "de", label: "DE", name: "Deutsch" },
  { code: "nl", label: "NL", name: "Nederlands" },
  { code: "fr", label: "FR", name: "Français" },
  { code: "cs", label: "CS", name: "Čeština" },
];

const DICTS = { en, de, nl, fr, cs };

/* The locale each language formats dates with. de-AT rather than de-DE:
   Jänner, not Januar. */
const LOCALES = { en: "en-GB", de: "de-AT", nl: "nl-NL", fr: "fr-FR", cs: "cs-CZ" };

/* Numbers are the one place de-AT is not what people expect: it follows
   ÖNORM and groups with a space ("1 524"), while Austrian sites write
   "1.524". Only the exceptions are listed; everything else uses its own
   locale. */
const NUMBER_LOCALES = { de: "de-DE" };

const STORE_KEY = "hf-lang";

/* The browser's preferred languages, best match first. Region is ignored:
   de-CH and de-AT both get German. */
export function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    // private mode, or storage blocked — fall through to the browser's list
  }
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const w of wanted) {
    const code = String(w).toLowerCase().split("-")[0];
    if (DICTS[code]) return code;
  }
  return "en";
}

export const Ctx = createContext(null);

/* The strings, formatters and the setter, rebuilt whenever the language
   changes. I18nProvider puts the result on the context. */
export function buildApi(lang, setLang) {
  const locale = LOCALES[lang] || "en-GB";
  const dict = DICTS[lang] || en;
  const plural = new Intl.PluralRules(locale);

  /* A string may be a plain string or, where a count changes the wording, an
     object of plural forms ({ one, other } in English, which Czech extends
     with few and many). Intl decides which form a count takes. */
  const t = (key, vars) => {
    let s = dict[key] ?? en[key];
    if (s == null) return key;
    if (typeof s === "object") {
      const form = plural.select(Number(vars?.count ?? 0));
      s = s[form] ?? s.other ?? "";
    }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };

  const choose = (code) => {
    if (!DICTS[code]) return;
    try {
      localStorage.setItem(STORE_KEY, code);
    } catch {
      // the choice still holds for this visit
    }
    setLang(code);
  };

  return {
    lang,
    locale,
    setLang: choose,
    t,
    // 1,524 in English, 1.524 in German
    nf: (n) => Number(n).toLocaleString(NUMBER_LOCALES[lang] || locale),
    // "January", "Jänner", "leden"
    monthName: (i) =>
      new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2021, i, 1)),
    /* Two letters per weekday, Monday first. Intl gives "Mon" / "Mo." / "lun."
       depending on the language; the trailing dot goes and the rest is cut to
       two, which is what the grid has room for. */
    dowShort: () => {
      const f = new Intl.DateTimeFormat(locale, { weekday: "short" });
      return Array.from({ length: 7 }, (_, i) =>
        f.format(new Date(2021, 1, i + 1)).replace(/\./g, "").slice(0, 2)
      );
    },
  };
}

export function useI18n() {
  const api = useContext(Ctx);
  if (!api) throw new Error("useI18n outside I18nProvider");
  return api;
}
