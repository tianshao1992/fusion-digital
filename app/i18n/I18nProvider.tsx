'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  localeFromCookie,
  localeRegistry,
  resolveLocale,
  type AppLocale,
} from './config';
import { messages, type MessageKey } from './messages';
import { localizeContent } from './content';

type MessageVariables = Record<string, string | number>;
type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, variables?: MessageVariables) => string;
  content: (source: string) => string;
};

function formatMessage(template: string, variables?: MessageVariables): string {
  if (!variables) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => (
    Object.hasOwn(variables, key) ? String(variables[key]) : match
  ));
}

function translate(locale: AppLocale, key: MessageKey, variables?: MessageVariables): string {
  const template = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key;
  return formatMessage(template, variables);
}

const defaultValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key, variables) => translate(DEFAULT_LOCALE, key, variables),
  content: (source) => source,
};

const I18nContext = createContext<I18nContextValue>(defaultValue);

function applyDocumentLocale(locale: AppLocale) {
  const definition = localeRegistry[locale] ?? localeRegistry[DEFAULT_LOCALE];
  document.documentElement.lang = definition.htmlLang;
  document.documentElement.dir = definition.dir;
}

function readClientPreference(): AppLocale | null {
  const cookieLocale = localeFromCookie(document.cookie);
  if (cookieLocale) return cookieLocale;
  try {
    const storedLocale = resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    if (storedLocale) return storedLocale;
  } catch {
    // Storage can be blocked by privacy settings; the cookie/navigator path remains usable.
  }
  return navigator.languages.map(resolveLocale).find((locale): locale is AppLocale => locale !== null)
    ?? resolveLocale(navigator.language);
}

function persistClientPreference(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The cookie still records the preference when local storage is unavailable.
  }
}

export default function I18nProvider({ children, initialLocale = DEFAULT_LOCALE }: { children: ReactNode; initialLocale?: AppLocale }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const preferred = readClientPreference() ?? initialLocale;
      setLocaleState(preferred);
      applyDocumentLocale(preferred);
    });
    return () => { cancelled = true; };
  }, [initialLocale]);

  const setLocale = useCallback((next: AppLocale) => {
    const resolved = resolveLocale(next) ?? DEFAULT_LOCALE;
    setLocaleState(resolved);
    applyDocumentLocale(resolved);
    persistClientPreference(resolved);
    // Several routes localize Server Components from the locale cookie. Refresh
    // the current route after persisting it so server and client content switch
    // as one coherent document instead of leaving a mixed-language page.
    router.refresh();
  }, [router]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key, variables) => translate(locale, key, variables),
    content: (source) => localizeContent(locale, source),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
