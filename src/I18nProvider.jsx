import { useEffect, useMemo, useState } from "react";
import { Ctx, buildApi, detect } from "./i18n";

/* Holds the chosen language and hands the strings and formatters to the tree.
   Everything else lives in i18n.js, which this file re-exports nothing from:
   a .jsx file that exports more than components breaks fast refresh. */
export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detect);

  /* Screen readers pick their voice from this, and search engines read it as
     the page's language. */
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const api = useMemo(() => buildApi(lang, setLang), [lang]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
