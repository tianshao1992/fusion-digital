export const THEME_STORAGE_KEY = 'fusiondigital.theme';
export const THEME_COOKIE_NAME = 'fd_theme';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
