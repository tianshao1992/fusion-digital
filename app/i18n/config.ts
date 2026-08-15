export const localeRegistry = {
  'zh-CN': {
    code: 'zh-CN',
    htmlLang: 'zh-CN',
    dir: 'ltr',
    label: '简体中文',
    shortLabel: '中',
  },
  en: {
    code: 'en',
    htmlLang: 'en',
    dir: 'ltr',
    label: 'English',
    shortLabel: 'EN',
  },
} as const;

export type AppLocale = keyof typeof localeRegistry;

export const DEFAULT_LOCALE: AppLocale = 'zh-CN';
export const LOCALE_COOKIE_NAME = 'fusiondigital_locale';
export const LOCALE_STORAGE_KEY = 'fusiondigital:locale:v1';
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function resolveLocale(value: unknown): AppLocale | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace('_', '-').toLowerCase();
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized.startsWith('zh-hans')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return null;
}

export function localeFromCookie(cookieHeader: string): AppLocale | null {
  const encoded = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.slice(LOCALE_COOKIE_NAME.length + 1);
  if (!encoded) return null;
  try {
    return resolveLocale(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}
