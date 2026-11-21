import { enDictionary, type Dictionary } from "./en";
import { omDictionary } from "./om";
import { amDictionary } from "./am";
import type { Locale } from "./locales";

export type { Dictionary } from "./en";
export * from "./locales";

const DICTIONARIES: Record<Locale, Dictionary> = { en: enDictionary, om: omDictionary, am: amDictionary };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Replace {placeholders} in a translated string. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(values[key] ?? `{${key}}`));
}